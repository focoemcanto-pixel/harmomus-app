import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

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
  stripePriceId: string | null;
  customerEmail: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
} | null;

function verifySignature(payload: string, signature: string, secret: string) {
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=")));
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const digest = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const digestBuffer = Buffer.from(digest, "hex");
  const signatureBuffer = Buffer.from(parts.v1, "hex");

  return digestBuffer.length === signatureBuffer.length && timingSafeEqual(digestBuffer, signatureBuffer);
}

function normalizeMetadataValue(value: unknown) {
  return String(value ?? "").trim() || null;
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
  console.log("[stripe.webhook.getPlanByStripePriceId] buscando plano", { price_id: stripePriceId, metadata_plan_slug: metadataPlanSlug ?? null });

  if (metadataPlanSlug) {
    const metadataPlanResponse = await supabase.from("plans").select("id, slug").eq("slug", metadataPlanSlug).maybeSingle();
    console.log("[stripe.webhook.getPlanByStripePriceId] resultado por metadata plan_slug", metadataPlanResponse);
    if (metadataPlanResponse.error) console.error("[stripe.webhook.getPlanByStripePriceId] erro Supabase por metadata plan_slug", metadataPlanResponse);
    if (metadataPlanResponse.data?.id) return metadataPlanResponse.data;
  }

  if (!stripePriceId) return null;

  const pricePlanResponse = await supabase.from("plans").select("id, slug").eq("stripe_price_id", stripePriceId).maybeSingle();
  console.log("[stripe.webhook.getPlanByStripePriceId] resultado por stripe_price_id", pricePlanResponse);
  if (pricePlanResponse.error) console.error("[stripe.webhook.getPlanByStripePriceId] erro Supabase por stripe_price_id", pricePlanResponse);
  if (pricePlanResponse.data?.id) return pricePlanResponse.data;

  const fallbackSlug = getPlanSlugFromEnvPrice(stripePriceId);
  if (!fallbackSlug) return null;

  const fallbackPlanResponse = await supabase.from("plans").select("id, slug").eq("slug", fallbackSlug).maybeSingle();
  console.log("[stripe.webhook.getPlanByStripePriceId] resultado fallback por env price", fallbackPlanResponse);
  if (fallbackPlanResponse.error) console.error("[stripe.webhook.getPlanByStripePriceId] erro Supabase fallback", fallbackPlanResponse);
  return fallbackPlanResponse.data ?? null;
}

async function ensureUserIdByCustomerOrEmail(supabase: any, customerId: string | null, email: string | null) {
  console.log("[stripe.webhook.ensureUserIdByCustomerOrEmail] buscando user", { customer_id: customerId, metadata_email: email });

  if (customerId) {
    const byCustomerResponse = await supabase
      .from("subscriptions")
      .select("user_id")
      .or(`stripe_customer_id.eq.${customerId},gateway_customer_id.eq.${customerId}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("[stripe.webhook.ensureUserIdByCustomerOrEmail] resultado por customer_id", {
      user_encontrado: Boolean(byCustomerResponse.data?.user_id),
      data: byCustomerResponse.data ?? null,
      supabase_error: byCustomerResponse.error ?? null,
      supabase_response: byCustomerResponse,
    });
    if (byCustomerResponse.error) console.error("[stripe.webhook.ensureUserIdByCustomerOrEmail] erro Supabase por customer_id", byCustomerResponse);

    if (byCustomerResponse.data?.user_id) return byCustomerResponse.data.user_id as string;
  }

  if (!email) {
    console.error("[stripe.webhook.ensureUserIdByCustomerOrEmail] USER_ID_MISSING", { customer_id: customerId, metadata_email: email });
    return null;
  }

  const byEmailResponse = await supabase.from("profiles").select("id,email,onboarding_status").ilike("email", email).maybeSingle();
  console.log("[stripe.webhook.ensureUserIdByCustomerOrEmail] resultado por email", {
    profile_encontrado: Boolean(byEmailResponse.data?.id),
    user_encontrado: Boolean(byEmailResponse.data?.id),
    profile: byEmailResponse.data ?? null,
    supabase_error: byEmailResponse.error ?? null,
    supabase_response: byEmailResponse,
  });
  if (byEmailResponse.error) console.error("[stripe.webhook.ensureUserIdByCustomerOrEmail] erro Supabase por email", byEmailResponse);
  if (!byEmailResponse.data?.id) console.error("[stripe.webhook.ensureUserIdByCustomerOrEmail] PROFILE_NOT_FOUND", { customer_id: customerId, metadata_email: email });

  return byEmailResponse.data?.id ?? null;
}

async function getProfileForWebhook(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("id,full_name,email,phone").eq("id", userId).maybeSingle();
  return data ?? null;
}

async function downgradeToFree(supabase: any, userId: string, patch: Record<string, unknown>) {
  const freePlanResponse = await supabase.from("plans").select("id").eq("slug", "free").single();
  console.log("[stripe.webhook.downgradeToFree] plano free", freePlanResponse);
  if (freePlanResponse.error) console.error("[stripe.webhook.downgradeToFree] erro Supabase ao buscar plano free", freePlanResponse);
  if (!freePlanResponse.data?.id) return;

  const payload = { user_id: userId, plan_id: freePlanResponse.data.id, ...patch };
  console.log("[stripe.webhook.downgradeToFree] payload salvo no banco", payload);
  const response = await supabase.from("subscriptions").upsert(payload, { onConflict: "user_id" }).select();
  console.log("[stripe.webhook.downgradeToFree] resposta Supabase", response);
  if (response.error) console.error("[stripe.webhook.downgradeToFree] erro Supabase ao fazer downgrade", response);
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

async function createOrUpdateSubscription(supabase: any, payload: Record<string, unknown>) {
  console.log("[stripe.webhook.createOrUpdateSubscription] payload salvo no banco", payload);

  const response = await supabase.from("subscriptions").upsert(payload, { onConflict: "user_id" }).select();

  console.log("[stripe.webhook.createOrUpdateSubscription] resposta completa do Supabase", response);
  if (response.error) {
    console.error("[stripe.webhook.createOrUpdateSubscription] erro completo do Supabase", response);
  }

  return response;
}

async function syncSubscriptionFromStripeEvent(supabase: any, event: StripeEvent): Promise<SyncedSubscriptionContext> {
  console.log("[stripe.webhook.syncSubscription] início", { event_id: event.id, event_type: event.type });

  const object = event.data?.object ?? {};
  const isCheckoutSession = event.type === "checkout.session.completed";

  if (isCheckoutSession) {
    console.log("[stripe.webhook.syncSubscription] checkout.session.completed", {
      session_id: object.id ?? null,
      session_mode: object.mode ?? null,
      session_customer: typeof object.customer === "string" ? object.customer : object.customer?.id ?? null,
      session_subscription: typeof object.subscription === "string" ? object.subscription : object.subscription?.id ?? null,
      session_customer_email: object.customer_email ?? object.customer_details?.email ?? null,
      session_metadata: object.metadata ?? null,
      metadata_user_id: object.metadata?.user_id ?? null,
      metadata_email: object.metadata?.email ?? null,
    });
  }

  const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id ?? null;
  const subscriptionId = object.subscription ?? (String(object.id ?? "").startsWith("sub_") ? object.id : null);

  if (isCheckoutSession && !subscriptionId) {
    console.error("[stripe.webhook.syncSubscription] SESSION_SUBSCRIPTION_NULL", { session_id: object.id ?? null, session_subscription: object.subscription ?? null });
  }

  let fullSubscription = object;
  if (subscriptionId) {
    try {
      fullSubscription = await getStripeSubscription(subscriptionId);
    } catch (error) {
      console.error("[stripe.webhook.syncSubscription] erro ao buscar subscription Stripe; usando objeto do evento", { subscription_id: subscriptionId, error, object });
      fullSubscription = object;
    }
  }

  const stripePriceId =
    fullSubscription?.items?.data?.[0]?.price?.id ??
    object.items?.data?.[0]?.price?.id ??
    object.lines?.data?.[0]?.price?.id ??
    object.plan?.id ??
    object.price?.id ??
    null;

  const customerEmail =
    fullSubscription?.metadata?.email ??
    object.metadata?.email ??
    object.customer_details?.email ??
    object.customer_email ??
    object.email ??
    null;
  const metadataUserId =
    normalizeMetadataValue(fullSubscription?.metadata?.user_id) ??
    normalizeMetadataValue(object.metadata?.user_id) ??
    normalizeMetadataValue(object.subscription_details?.metadata?.user_id);
  const metadataPlanSlug =
    normalizeMetadataValue(fullSubscription?.metadata?.plan_slug)?.toLowerCase() ??
    normalizeMetadataValue(object.metadata?.plan_slug)?.toLowerCase() ??
    normalizeMetadataValue(object.subscription_details?.metadata?.plan_slug)?.toLowerCase();

  console.log("[stripe.webhook.syncSubscription] subscription encontrada no Stripe", {
    subscription_encontrada_no_stripe: Boolean(fullSubscription?.id),
    status_stripe: fullSubscription?.status ?? object.status ?? null,
    customer_id: customerId,
    subscription_id: fullSubscription?.id ?? subscriptionId ?? null,
    price_id: stripePriceId,
    current_period_end: fullSubscription?.current_period_end ? new Date(fullSubscription.current_period_end * 1000).toISOString() : null,
    metadata: fullSubscription?.metadata ?? object.metadata ?? null,
    metadata_user_id: metadataUserId,
    metadata_email: customerEmail,
  });

  if (!metadataUserId) console.error("[stripe.webhook.syncSubscription] USER_ID_MISSING", { event_id: event.id, event_type: event.type, metadata: fullSubscription?.metadata ?? object.metadata ?? null });

  const userId = metadataUserId ?? (await ensureUserIdByCustomerOrEmail(supabase, customerId, customerEmail));
  console.log("[stripe.webhook.syncSubscription] user encontrado", { user_encontrado: Boolean(userId), user_id: userId ?? null });
  if (!userId) {
    console.error("[stripe.webhook.syncSubscription] USER_ID_MISSING", { event_id: event.id, event_type: event.type, customer_id: customerId, metadata_email: customerEmail });
    return null;
  }

  const profileResponse = await supabase.from("profiles").select("id,email,onboarding_status").eq("id", userId).maybeSingle();
  console.log("[stripe.webhook.syncSubscription] profile encontrado", {
    profile_encontrado: Boolean(profileResponse.data?.id),
    profile: profileResponse.data ?? null,
    supabase_error: profileResponse.error ?? null,
    supabase_response: profileResponse,
  });
  if (profileResponse.error) console.error("[stripe.webhook.syncSubscription] erro Supabase ao buscar profile", profileResponse);
  if (!profileResponse.data?.id) console.error("[stripe.webhook.syncSubscription] PROFILE_NOT_FOUND", { user_id: userId, customer_id: customerId, metadata_email: customerEmail });

  const status = mapStripeStatus(fullSubscription?.status ?? object.status ?? "active");
  const currentPeriodEnd = fullSubscription?.current_period_end
    ? new Date(fullSubscription.current_period_end * 1000).toISOString()
    : null;
  const trialEndsAt = fullSubscription?.trial_end ? new Date(fullSubscription.trial_end * 1000).toISOString() : null;

  if (event.type === "customer.subscription.deleted") {
    await downgradeToFree(supabase, userId, {
      status: "canceled",
      gateway: "stripe",
      stripe_customer_id: customerId,
      gateway_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      gateway_subscription_id: subscriptionId,
      stripe_price_id: stripePriceId,
      current_period_end: currentPeriodEnd,
      trial_ends_at: trialEndsAt,
      next_billing_at: null,
      canceled_at: new Date().toISOString(),
      last_webhook_event: event.type,
      updated_at: new Date().toISOString(),
    });

    return { userId, planSlug: "free", status: "canceled", customerId, subscriptionId, stripePriceId, customerEmail, currentPeriodEnd, trialEndsAt };
  }

  const plan = await getPlanByStripePriceId(supabase, stripePriceId, metadataPlanSlug);
  if (!plan?.id) {
    console.error("[stripe.webhook.syncSubscription] plano não encontrado", { price_id: stripePriceId, metadata_plan_slug: metadataPlanSlug });
    return null;
  }

  const subscriptionPayload = {
    user_id: userId,
    plan_id: plan.id,
    status,
    gateway: "stripe",
    stripe_customer_id: customerId,
    gateway_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    gateway_subscription_id: subscriptionId,
    stripe_price_id: stripePriceId,
    current_period_end: currentPeriodEnd,
    trial_ends_at: trialEndsAt,
    next_billing_at: currentPeriodEnd,
    auto_renew: !Boolean(fullSubscription?.cancel_at_period_end),
    last_webhook_event: event.type,
    updated_at: new Date().toISOString(),
  };

  const saveResponse = await createOrUpdateSubscription(supabase, subscriptionPayload);
  if (saveResponse.error) return null;

  return { userId, planSlug: plan.slug ?? null, status, customerId, subscriptionId, stripePriceId, customerEmail, currentPeriodEnd, trialEndsAt };
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
      console.error("[stripe.webhook] plan.premium_activated falhou", webhookError);
    }
  }
}

export async function POST(req: Request) {
  console.log("[stripe.webhook] webhook stripe recebido");

  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const payload = await req.text();
  if (!verifySignature(payload, signature, secret)) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  const event = JSON.parse(payload) as StripeEvent;
  console.log("[stripe.webhook] event.type", { event_id: event.id, event_type: event.type });

  if (event.type === "checkout.session.completed") console.log("[stripe.webhook] checkout.session.completed recebido", { event_id: event.id });
  if (event.type === "customer.subscription.created") console.log("[stripe.webhook] customer.subscription.created recebido", { event_id: event.id });
  if (event.type === "customer.subscription.updated") console.log("[stripe.webhook] customer.subscription.updated recebido", { event_id: event.id });

  const acceptedEvents = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ]);

  const supabase = createSupabaseAdminClient() as any;
  const billingInsertResponse = await supabase.from("billing_events").insert({ provider: "stripe", event_type: event.type, payload: event, processed: false }).select();
  console.log("[stripe.webhook] resposta Supabase ao inserir billing_event", billingInsertResponse);
  if (billingInsertResponse.error) console.error("[stripe.webhook] erro Supabase ao inserir billing_event", billingInsertResponse);

  if (acceptedEvents.has(event.type)) {
    const context = await syncSubscriptionFromStripeEvent(supabase, event);
    await dispatchStripeWebhookEvent(supabase, event, context);
  }

  const billingUpdateResponse = await supabase
    .from("billing_events")
    .update({ processed: true })
    .eq("provider", "stripe")
    .eq("event_type", event.type)
    .eq("payload->>id", event.id)
    .select();
  console.log("[stripe.webhook] resposta Supabase ao marcar billing_event processado", billingUpdateResponse);
  if (billingUpdateResponse.error) console.error("[stripe.webhook] erro Supabase ao marcar billing_event processado", billingUpdateResponse);

  return NextResponse.json({ received: true });
}
