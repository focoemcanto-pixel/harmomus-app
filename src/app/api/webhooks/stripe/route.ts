import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { ensureMinistryForSubscription } from "@/lib/data/ministry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeSubscription } from "@/lib/stripe/client";
import { mapStripeStatus } from "@/lib/stripe/status";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

export const runtime = "nodejs";

type StripeEvent = { id: string; type: string; data?: { object?: any } };

type SyncedSubscriptionContext = {
  userId: string;
  planSlug: string | null;
  status: string;
  customerId: string | null;
  subscriptionId: string | null;
  localSubscriptionId: string | null;
  stripePriceId: string | null;
  customerEmail: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
} | null;

const ACCEPTED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function verifySignature(payload: string, signature: string, secret: string) {
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=")));
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const digest = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const digestBuffer = Buffer.from(digest, "hex");
  const signatureBuffer = Buffer.from(parts.v1, "hex");

  return digestBuffer.length === signatureBuffer.length && timingSafeEqual(digestBuffer, signatureBuffer);
}

function normalize(value: unknown) {
  return String(value ?? "").trim() || null;
}

function normalizeLower(value: unknown) {
  return normalize(value)?.toLowerCase() ?? null;
}

function getStripeId(value: unknown) {
  if (typeof value === "string") return normalize(value);
  if (value && typeof value === "object" && "id" in value) return normalize((value as { id?: unknown }).id);
  return null;
}

function toIsoFromStripeSeconds(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function getPlanSlugFromEnvPrice(stripePriceId: string | null) {
  if (!stripePriceId) return null;
  if (stripePriceId === process.env.STRIPE_PLUS_PRICE_ID) return "plus";
  if (stripePriceId === process.env.STRIPE_PREMIUM_PRICE_ID) return "premium";
  if (stripePriceId === process.env.STRIPE_MINISTRY_10_PRICE_ID) return "ministry_10";
  if (stripePriceId === process.env.STRIPE_MINISTRY_20_PRICE_ID) return "ministry_20";
  if (stripePriceId === process.env.STRIPE_MINISTRY_40_PRICE_ID) return "ministry_40";
  return null;
}

async function getPlanByStripePriceId(supabase: any, stripePriceId: string | null, metadataPlanSlug?: string | null) {
  if (metadataPlanSlug) {
    const { data: metadataPlan, error } = await supabase
      .from("plans")
      .select("id, slug")
      .eq("slug", metadataPlanSlug)
      .maybeSingle();

    if (error) console.error("[stripe.webhook] Falha ao buscar plano por metadata", error);
    if (metadataPlan?.id) return metadataPlan;
  }

  if (stripePriceId) {
    const { data: pricePlan, error } = await supabase
      .from("plans")
      .select("id, slug")
      .eq("stripe_price_id", stripePriceId)
      .maybeSingle();

    if (error) console.error("[stripe.webhook] Falha ao buscar plano por price id", error);
    if (pricePlan?.id) return pricePlan;
  }

  const fallbackSlug = getPlanSlugFromEnvPrice(stripePriceId);
  if (!fallbackSlug) return null;

  const { data: fallbackPlan, error } = await supabase
    .from("plans")
    .select("id, slug")
    .eq("slug", fallbackSlug)
    .maybeSingle();

  if (error) console.error("[stripe.webhook] Falha ao buscar plano fallback", error);
  return fallbackPlan ?? null;
}

async function ensureUserIdByCustomerOrEmail(supabase: any, customerId: string | null, email: string | null) {
  if (customerId) {
    const { data: byCustomer, error } = await supabase
      .from("subscriptions")
      .select("user_id")
      .or(`stripe_customer_id.eq.${customerId},gateway_customer_id.eq.${customerId}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) console.error("[stripe.webhook] Falha ao buscar usuário por customer", error);
    if (byCustomer?.user_id) return byCustomer.user_id as string;
  }

  if (!email) return null;

  const { data: byEmail, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (error) console.error("[stripe.webhook] Falha ao buscar usuário por e-mail", error);
  return byEmail?.id ?? null;
}

async function getProfileForWebhook(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,email,phone")
    .eq("id", userId)
    .maybeSingle();

  if (error) console.error("[stripe.webhook] Falha ao buscar profile", error);
  return data ?? null;
}

async function saveSubscriptionByUserId(supabase: any, payload: Record<string, unknown>) {
  const userId = String(payload.user_id ?? "").trim();
  if (!userId) return { data: null, error: new Error("user_id ausente no payload de assinatura") };

  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) return { data: null, error: existingError };

  const response = existing?.id
    ? await supabase.from("subscriptions").update(payload).eq("id", existing.id).select("id")
    : await supabase.from("subscriptions").insert({ ...payload, created_at: new Date().toISOString() }).select("id");

  if (response.error) console.error("[stripe.webhook] Falha ao salvar assinatura", response.error);
  return response;
}

async function downgradeToFree(supabase: any, userId: string, patch: Record<string, unknown>) {
  const { data: freePlan, error } = await supabase.from("plans").select("id").eq("slug", "free").single();
  if (error) console.error("[stripe.webhook] Falha ao buscar plano free", error);
  if (!freePlan?.id) return;

  await saveSubscriptionByUserId(supabase, {
    user_id: userId,
    plan_id: freePlan.id,
    ...patch,
  });

  const { error: ministryError } = await supabase
    .from("ministries")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("owner_id", userId);

  if (ministryError && ministryError.code !== "42P01") {
    console.error("[stripe.webhook] Falha ao cancelar ministério", ministryError);
  }
}

function mapStripeEventToWebhookEvent(eventType: string, status: string) {
  if (eventType === "checkout.session.completed") return "checkout.completed";
  if (eventType === "customer.subscription.created") return "subscription.created";
  if (eventType === "customer.subscription.deleted") return "subscription.canceled";
  if (eventType === "invoice.paid") return "payment.approved";
  if (eventType === "invoice.payment_failed") return "subscription.payment_failed";
  if (eventType === "customer.subscription.updated" && status === "active") return "subscription.renewed";
  return null;
}

async function syncSubscriptionFromStripeEvent(supabase: any, event: StripeEvent): Promise<SyncedSubscriptionContext> {
  const object = event.data?.object ?? {};
  const objectSubscriptionId = getStripeId(object.subscription);
  const ownSubscriptionId = String(object.id ?? "").startsWith("sub_") ? String(object.id) : null;
  const subscriptionId = objectSubscriptionId ?? ownSubscriptionId;

  let fullSubscription = object;
  if (subscriptionId) {
    try {
      fullSubscription = await getStripeSubscription(subscriptionId);
    } catch (error) {
      console.error("[stripe.webhook] Falha ao buscar subscription no Stripe; usando payload do evento", error);
      fullSubscription = object;
    }
  }

  const customerId = getStripeId(fullSubscription?.customer) ?? getStripeId(object.customer);
  const stripePriceId =
    fullSubscription?.items?.data?.[0]?.price?.id ??
    object.items?.data?.[0]?.price?.id ??
    object.lines?.data?.[0]?.price?.id ??
    object.plan?.id ??
    object.price?.id ??
    null;

  const customerEmail =
    normalize(fullSubscription?.metadata?.email) ??
    normalize(object.metadata?.email) ??
    normalize(object.customer_details?.email) ??
    normalize(object.customer_email) ??
    normalize(object.email);

  const metadataUserId =
    normalize(fullSubscription?.metadata?.user_id) ??
    normalize(object.metadata?.user_id) ??
    normalize(object.subscription_details?.metadata?.user_id);

  const metadataPlanSlug =
    normalizeLower(fullSubscription?.metadata?.plan_slug) ??
    normalizeLower(object.metadata?.plan_slug) ??
    normalizeLower(object.subscription_details?.metadata?.plan_slug);

  const userId = metadataUserId ?? (await ensureUserIdByCustomerOrEmail(supabase, customerId, customerEmail));
  if (!userId) {
    console.error("[stripe.webhook] Usuário não localizado para evento Stripe", { eventId: event.id, eventType: event.type, customerId });
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) console.error("[stripe.webhook] Falha ao confirmar profile", profileError);
  if (!profile?.id) {
    console.error("[stripe.webhook] Profile não encontrado para assinatura Stripe", { eventId: event.id, userId });
    return null;
  }

  const status = mapStripeStatus(fullSubscription?.status ?? object.status ?? "active");
  const currentPeriodEnd = toIsoFromStripeSeconds(fullSubscription?.current_period_end);
  const trialEndsAt = toIsoFromStripeSeconds(fullSubscription?.trial_end);
  const syncedSubscriptionId = getStripeId(fullSubscription?.id) ?? subscriptionId;

  if (event.type === "customer.subscription.deleted") {
    await downgradeToFree(supabase, userId, {
      status: "canceled",
      gateway: "stripe",
      stripe_customer_id: customerId,
      gateway_customer_id: customerId,
      stripe_subscription_id: syncedSubscriptionId,
      gateway_subscription_id: syncedSubscriptionId,
      stripe_price_id: stripePriceId,
      current_period_end: currentPeriodEnd,
      trial_ends_at: trialEndsAt,
      next_billing_at: null,
      canceled_at: new Date().toISOString(),
      last_webhook_event: event.type,
      updated_at: new Date().toISOString(),
    });

    return { userId, planSlug: "free", status: "canceled", customerId, subscriptionId: syncedSubscriptionId, localSubscriptionId: null, stripePriceId, customerEmail, currentPeriodEnd, trialEndsAt };
  }

  const plan = await getPlanByStripePriceId(supabase, stripePriceId, metadataPlanSlug);
  if (!plan?.id) {
    console.error("[stripe.webhook] Plano não encontrado para evento Stripe", { eventId: event.id, stripePriceId, metadataPlanSlug });
    return null;
  }

  const saveResponse = await saveSubscriptionByUserId(supabase, {
    user_id: userId,
    plan_id: plan.id,
    status,
    gateway: "stripe",
    stripe_customer_id: customerId,
    gateway_customer_id: customerId,
    stripe_subscription_id: syncedSubscriptionId,
    gateway_subscription_id: syncedSubscriptionId,
    stripe_price_id: stripePriceId,
    current_period_end: currentPeriodEnd,
    trial_ends_at: trialEndsAt,
    next_billing_at: currentPeriodEnd,
    auto_renew: !Boolean(fullSubscription?.cancel_at_period_end),
    last_webhook_event: event.type,
    updated_at: new Date().toISOString(),
  });

  if (saveResponse.error) return null;

  const localSubscriptionId = saveResponse.data?.[0]?.id ?? null;

  try {
    await ensureMinistryForSubscription({
      userId,
      planSlug: plan.slug ?? null,
      subscriptionId: localSubscriptionId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: syncedSubscriptionId,
      status,
      currentPeriodEnd,
      trialEndsAt,
    });
  } catch (ministryError) {
    console.error("[stripe.webhook] Falha ao sincronizar central ministerial", ministryError);
  }

  return { userId, planSlug: plan.slug ?? null, status, customerId, subscriptionId: syncedSubscriptionId, localSubscriptionId, stripePriceId, customerEmail, currentPeriodEnd, trialEndsAt };
}

async function dispatchStripeWebhookEvent(supabase: any, event: StripeEvent, context: SyncedSubscriptionContext) {
  if (!context) return;

  const webhookEvent = mapStripeEventToWebhookEvent(event.type, context.status);
  if (!webhookEvent) return;

  const profile = await getProfileForWebhook(supabase, context.userId);

  await dispatchWebhookEvent({
    event: webhookEvent as any,
    source: "stripe",
    recipient: {
      name: profile?.full_name ?? null,
      email: profile?.email ?? context.customerEmail,
      phone: profile?.phone ?? null,
    },
    data: {
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      user_id: context.userId,
      plan: context.planSlug,
      status: context.status,
      stripe_customer_id: context.customerId,
      stripe_subscription_id: context.subscriptionId,
      stripe_price_id: context.stripePriceId,
      current_period_end: context.currentPeriodEnd,
      trial_ends_at: context.trialEndsAt,
    },
  });

  if (context.planSlug === "premium" && ["active", "trialing"].includes(context.status)) {
    try {
      await dispatchWebhookEvent({
        event: "plan.premium_activated",
        source: "stripe.subscription",
        recipient: {
          name: profile?.full_name ?? null,
          email: profile?.email ?? context.customerEmail,
          phone: profile?.phone ?? null,
        },
        data: {
          user_id: context.userId,
          plan: context.planSlug,
          status: context.status,
          activated_at: new Date().toISOString(),
          stripe_event_type: event.type,
        },
      });
    } catch (webhookError) {
      console.error("[stripe.webhook] Falha ao disparar plan.premium_activated", webhookError);
    }
  }
}

async function getExistingBillingEvent(supabase: any, eventId: string) {
  const { data, error } = await supabase
    .from("billing_events")
    .select("id, processed")
    .eq("provider", "stripe")
    .eq("payload->>id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error("[stripe.webhook] Falha ao verificar idempotência do evento", error);
  return data ?? null;
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const payload = await req.text();
  if (!verifySignature(payload, signature, secret)) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  const event = JSON.parse(payload) as StripeEvent;
  const supabase = createSupabaseAdminClient() as any;
  const existingBillingEvent = await getExistingBillingEvent(supabase, event.id);

  if (existingBillingEvent?.processed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const billingEventResponse = existingBillingEvent?.id
    ? { data: [{ id: existingBillingEvent.id }], error: null }
    : await supabase
        .from("billing_events")
        .insert({ provider: "stripe", event_type: event.type, payload: event, processed: false })
        .select("id");

  if (billingEventResponse.error) {
    console.error("[stripe.webhook] Falha ao registrar billing_event", billingEventResponse.error);
  }

  if (ACCEPTED_EVENTS.has(event.type)) {
    const context = await syncSubscriptionFromStripeEvent(supabase, event);
    await dispatchStripeWebhookEvent(supabase, event, context);
  }

  const billingEventId = billingEventResponse.data?.[0]?.id ?? existingBillingEvent?.id;
  const billingUpdateQuery = supabase.from("billing_events").update({ processed: true });

  const billingUpdateResponse = billingEventId
    ? await billingUpdateQuery.eq("id", billingEventId)
    : await billingUpdateQuery.eq("provider", "stripe").eq("payload->>id", event.id);

  if (billingUpdateResponse.error) {
    console.error("[stripe.webhook] Falha ao marcar billing_event como processado", billingUpdateResponse.error);
  }

  return NextResponse.json({ received: true });
}
