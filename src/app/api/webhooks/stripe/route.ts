import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { ensureMinistryForSubscription } from "@/lib/data/ministry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeSubscription } from "@/lib/stripe/client";
import { mapStripeStatus } from "@/lib/stripe/status";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

export const runtime = "nodejs";

type StripeEvent = { id: string; type: string; data?: { object?: any } };

type PreviousSubscriptionContext = {
  id: string | null;
  planId: string | null;
  planSlug: string | null;
};

type SyncedSubscriptionContext = {
  userId: string;
  planId: string | null;
  planSlug: string | null;
  previousPlanId: string | null;
  previousPlanSlug: string | null;
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
  "charge.refunded",
  "charge.dispute.created",
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

function cents(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
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

async function getCurrentSubscriptionForHistory(supabase: any, userId: string): Promise<PreviousSubscriptionContext> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan_id, plans(slug)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error("[stripe.webhook] Falha ao buscar assinatura anterior para histórico", error);

  return {
    id: data?.id ?? null,
    planId: data?.plan_id ?? null,
    planSlug: data?.plans?.slug ?? null,
  };
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
  const { data: freePlan, error } = await supabase.from("plans").select("id, slug").eq("slug", "free").single();
  if (error) console.error("[stripe.webhook] Falha ao buscar plano free", error);
  if (!freePlan?.id) return null;

  const previous = await getCurrentSubscriptionForHistory(supabase, userId);

  const saveResponse = await saveSubscriptionByUserId(supabase, {
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

  return {
    localSubscriptionId: saveResponse.data?.[0]?.id ?? previous.id ?? null,
    freePlanId: freePlan.id as string,
    freePlanSlug: freePlan.slug as string,
    previous,
  };
}

function mapStripeEventToWebhookEvent(eventType: string, status: string) {
  if (eventType === "checkout.session.completed") return "checkout.completed";
  if (eventType === "customer.subscription.created") return "subscription.created";
  if (eventType === "customer.subscription.deleted") return "subscription.canceled";
  if (eventType === "invoice.paid") return "payment.approved";
  if (eventType === "invoice.payment_failed") return "subscription.payment_failed";
  if (eventType === "charge.refunded") return "payment.refunded";
  if (eventType === "charge.dispute.created") return "payment.chargeback";
  if (eventType === "customer.subscription.updated" && status === "active") return "subscription.renewed";
  return null;
}

function normalizePlanFamily(slug?: string | null) {
  if (!slug) return null;
  if (slug.startsWith("ministry")) return "ministry";
  if (slug === "premium") return "premium";
  if (slug === "plus") return "plus";
  if (slug === "free") return "free";
  return null;
}

function getPlanActivatedEvent(planSlug?: string | null) {
  const family = normalizePlanFamily(planSlug);
  if (family === "plus") return "plan.plus_activated";
  if (family === "premium") return "plan.premium_activated";
  if (family === "ministry") return "plan.ministry_activated";
  if (family === "free") return "plan.free_activated";
  return null;
}

function getCheckoutCompletedEvent(planSlug?: string | null) {
  const family = normalizePlanFamily(planSlug);
  if (family === "plus") return "checkout.plus.completed";
  if (family === "premium") return "checkout.premium.completed";
  return null;
}

function shouldDispatchPlanActivated(eventType: string, context: NonNullable<SyncedSubscriptionContext>) {
  if (!["active", "trialing"].includes(context.status)) return false;
  return eventType === "checkout.session.completed" || eventType === "customer.subscription.created";
}

function planRank(slug?: string | null) {
  const family = normalizePlanFamily(slug);
  if (family === "free") return 0;
  if (family === "plus") return 1;
  if (family === "premium") return 2;
  if (family === "ministry") return 3;
  return -1;
}

function getHistoryChangeType(eventType: string, context: NonNullable<SyncedSubscriptionContext>) {
  if (eventType === "customer.subscription.deleted") return "canceled";
  if (eventType === "invoice.payment_failed") return "payment_failed";
  if (eventType === "invoice.paid") return "renewed";

  const fromSlug = context.previousPlanSlug;
  const toSlug = context.planSlug;

  if (!fromSlug && toSlug) return "created";
  if (!toSlug || fromSlug === toSlug) return null;

  const fromRank = planRank(fromSlug);
  const toRank = planRank(toSlug);
  if (fromRank >= 0 && toRank >= 0 && toRank > fromRank) return "upgrade";
  if (fromRank >= 0 && toRank >= 0 && toRank < fromRank) return "downgrade";
  return "change";
}

async function recordSubscriptionHistoryFromStripe(supabase: any, event: StripeEvent, context: SyncedSubscriptionContext) {
  if (!context) return;

  const changeType = getHistoryChangeType(event.type, context);
  if (!changeType) return;

  const payload = {
    user_id: context.userId,
    subscription_id: context.localSubscriptionId,
    from_plan_id: context.previousPlanId,
    to_plan_id: context.planId,
    from_plan_slug: context.previousPlanSlug,
    to_plan_slug: context.planSlug,
    change_type: changeType,
    source: "stripe",
    provider_event_id: event.id,
    metadata: {
      stripe_event_type: event.type,
      stripe_customer_id: context.customerId,
      stripe_subscription_id: context.subscriptionId,
      stripe_price_id: context.stripePriceId,
      status: context.status,
      current_period_end: context.currentPeriodEnd,
      trial_ends_at: context.trialEndsAt,
    },
  };

  const { error } = await supabase
    .from("subscription_history")
    .upsert(payload, { onConflict: "provider_event_id", ignoreDuplicates: true });

  if (error && error.code !== "42P01") {
    console.error("[stripe.webhook] Falha ao registrar subscription_history", error);
  }
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
  const previous = await getCurrentSubscriptionForHistory(supabase, userId);

  if (event.type === "customer.subscription.deleted") {
    const downgraded = await downgradeToFree(supabase, userId, {
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

    return {
      userId,
      planId: downgraded?.freePlanId ?? null,
      planSlug: "free",
      previousPlanId: downgraded?.previous.planId ?? previous.planId,
      previousPlanSlug: downgraded?.previous.planSlug ?? previous.planSlug,
      status: "canceled",
      customerId,
      subscriptionId: syncedSubscriptionId,
      localSubscriptionId: downgraded?.localSubscriptionId ?? previous.id ?? null,
      stripePriceId,
      customerEmail,
      currentPeriodEnd,
      trialEndsAt,
    };
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

  const localSubscriptionId = saveResponse.data?.[0]?.id ?? previous.id ?? null;

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

  return {
    userId,
    planId: plan.id ?? null,
    planSlug: plan.slug ?? null,
    previousPlanId: previous.planId,
    previousPlanSlug: previous.planSlug,
    status,
    customerId,
    subscriptionId: syncedSubscriptionId,
    localSubscriptionId,
    stripePriceId,
    customerEmail,
    currentPeriodEnd,
    trialEndsAt,
  };
}

async function saveBillingInvoiceFromStripeEvent(supabase: any, event: StripeEvent, context: SyncedSubscriptionContext) {
  if (!["invoice.paid", "invoice.payment_failed"].includes(event.type)) return;

  const invoice = event.data?.object ?? {};
  const providerInvoiceId = normalize(invoice.id);
  if (!providerInvoiceId) return;

  const stripeCustomerId = getStripeId(invoice.customer) ?? context?.customerId ?? null;
  const stripeSubscriptionId = getStripeId(invoice.subscription) ?? context?.subscriptionId ?? null;
  const stripePriceId = invoice.lines?.data?.[0]?.price?.id ?? context?.stripePriceId ?? null;
  const customerEmail =
    normalize(invoice.customer_email) ??
    normalize(invoice.customer_details?.email) ??
    context?.customerEmail ??
    null;

  const userId = context?.userId ?? (await ensureUserIdByCustomerOrEmail(supabase, stripeCustomerId, customerEmail));
  const plan = await getPlanByStripePriceId(supabase, stripePriceId, null);
  const period = invoice.lines?.data?.[0]?.period ?? {};
  const status = normalizeLower(invoice.status) ?? (event.type === "invoice.paid" ? "paid" : "payment_failed");
  const paidAt =
    toIsoFromStripeSeconds(invoice.status_transitions?.paid_at) ??
    (event.type === "invoice.paid" ? toIsoFromStripeSeconds(invoice.created) : null);

  const payload = {
    provider: "stripe",
    provider_invoice_id: providerInvoiceId,
    provider_event_id: event.id,
    user_id: userId,
    subscription_id: context?.localSubscriptionId ?? null,
    plan_id: plan?.id ?? null,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    stripe_price_id: stripePriceId,
    customer_email: customerEmail,
    status,
    currency: normalizeLower(invoice.currency) ?? "brl",
    amount_due_cents: cents(invoice.amount_due),
    amount_paid_cents: event.type === "invoice.paid" ? cents(invoice.amount_paid) : 0,
    amount_remaining_cents: cents(invoice.amount_remaining),
    invoice_url: normalize(invoice.invoice_pdf),
    hosted_invoice_url: normalize(invoice.hosted_invoice_url),
    paid_at: paidAt,
    period_start: toIsoFromStripeSeconds(period.start),
    period_end: toIsoFromStripeSeconds(period.end),
    raw_payload: invoice,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("billing_invoices")
    .upsert(payload, { onConflict: "provider,provider_invoice_id" });

  if (error) console.error("[stripe.webhook] Falha ao salvar billing_invoice", error);
}

async function dispatchStripeWebhookEvent(supabase: any, event: StripeEvent, context: SyncedSubscriptionContext) {
  if (!context) return;

  const webhookEvent = mapStripeEventToWebhookEvent(event.type, context.status);
  if (!webhookEvent) return;

  const profile = await getProfileForWebhook(supabase, context.userId);
  const recipient = {
    name: profile?.full_name ?? null,
    email: profile?.email ?? context.customerEmail,
    phone: profile?.phone ?? null,
  };
  const data = {
    stripe_event_id: event.id,
    stripe_event_type: event.type,
    user_id: context.userId,
    plan: context.planSlug,
    previous_plan: context.previousPlanSlug,
    status: context.status,
    stripe_customer_id: context.customerId,
    stripe_subscription_id: context.subscriptionId,
    stripe_price_id: context.stripePriceId,
    current_period_end: context.currentPeriodEnd,
    trial_ends_at: context.trialEndsAt,
  };

  const extraEvents = [
    event.type === "checkout.session.completed" ? getCheckoutCompletedEvent(context.planSlug) : null,
    shouldDispatchPlanActivated(event.type, context) ? getPlanActivatedEvent(context.planSlug) : null,
  ].filter(Boolean) as string[];

  const events = Array.from(new Set([webhookEvent, ...extraEvents]));

  await Promise.allSettled(
    events.map((eventName) =>
      dispatchWebhookEvent({
        event: eventName as any,
        source: "stripe",
        recipient,
        data,
      }),
    ),
  );
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

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

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
    await recordSubscriptionHistoryFromStripe(supabase, event, context);
    await saveBillingInvoiceFromStripeEvent(supabase, event, context);
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
