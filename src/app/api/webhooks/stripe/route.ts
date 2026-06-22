import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { trackMarketingEvent } from "@/lib/communications/events";
import { ensureMinistryForSubscription } from "@/lib/data/ministry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeSubscription } from "@/lib/stripe/client";
import { isActiveSubscriptionStatus } from "@/lib/access/subscription-plan";
import { mapStripeStatus } from "@/lib/stripe/status";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";
import { resolveWebhookRecipientForUser } from "@/lib/webhooks/recipient";
import type { WebhookEvent } from "@/types/webhooks";

export const runtime = "nodejs";

type StripeEvent = { id: string; type: string; data?: { object?: any } };

type PreviousSubscriptionContext = {
  id: string | null;
  planId: string | null;
  planSlug: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  gateway: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
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
  metadata: Record<string, unknown>;
} | null;

const ACCEPTED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "checkout.session.expired",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "charge.failed",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
]);

function isStripePaymentFailureEvent(eventType: string) {
  return ["invoice.payment_failed", "charge.failed", "payment_intent.payment_failed"].includes(eventType);
}

function shouldIgnoreStripeEventForCurrentNonStripeSubscription(eventType: string) {
  return ["customer.subscription.deleted", "checkout.session.expired"].includes(eventType) || isStripePaymentFailureEvent(eventType);
}

function isCurrentActiveNonStripeSubscription(previous: PreviousSubscriptionContext) {
  const gateway = normalizeLower(previous.gateway);
  if (!gateway || gateway === "stripe") return false;
  const status = normalizeLower(previous.status);
  if (!["active", "trialing"].includes(status ?? "")) return false;
  if (!previous.currentPeriodEnd) return true;
  const currentPeriodEndTime = Date.parse(previous.currentPeriodEnd);
  return Number.isNaN(currentPeriodEndTime) || currentPeriodEndTime > Date.now();
}

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
    const { data: metadataPlan, error } = await supabase.from("plans").select("id, slug").eq("slug", metadataPlanSlug).maybeSingle();
    if (error) console.error("[stripe.webhook] Falha ao buscar plano por metadata", error);
    if (metadataPlan?.id) return metadataPlan;
  }

  if (stripePriceId) {
    const { data: pricePlan, error } = await supabase.from("plans").select("id, slug").eq("stripe_price_id", stripePriceId).maybeSingle();
    if (error) console.error("[stripe.webhook] Falha ao buscar plano por price id", error);
    if (pricePlan?.id) return pricePlan;
  }

  const fallbackSlug = getPlanSlugFromEnvPrice(stripePriceId);
  if (!fallbackSlug) return null;

  const { data: fallbackPlan, error } = await supabase.from("plans").select("id, slug").eq("slug", fallbackSlug).maybeSingle();
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

  const { data: byEmail, error } = await supabase.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (error) console.error("[stripe.webhook] Falha ao buscar usuário por e-mail", error);
  return byEmail?.id ?? null;
}

async function getCurrentSubscriptionForHistory(supabase: any, userId: string): Promise<PreviousSubscriptionContext> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan_id, stripe_customer_id, gateway_customer_id, stripe_subscription_id, gateway_subscription_id, gateway, status, current_period_end, plans(slug)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error("[stripe.webhook] Falha ao buscar assinatura anterior para histórico", error);

  return {
    id: data?.id ?? null,
    planId: data?.plan_id ?? null,
    planSlug: data?.plans?.slug ?? null,
    customerId: data?.stripe_customer_id ?? data?.gateway_customer_id ?? null,
    subscriptionId: data?.stripe_subscription_id ?? data?.gateway_subscription_id ?? null,
    gateway: data?.gateway ?? null,
    status: data?.status ?? null,
    currentPeriodEnd: data?.current_period_end ?? null,
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

async function markSubscriptionWithoutActiveAccess(supabase: any, userId: string, patch: Record<string, unknown>, fallbackPlan?: { id?: string | null; slug?: string | null } | null) {
  const previous = await getCurrentSubscriptionForHistory(supabase, userId);
  const planId = previous.planId ?? fallbackPlan?.id;
  if (!planId) return null;

  const saveResponse = await saveSubscriptionByUserId(supabase, {
    user_id: userId,
    plan_id: planId,
    ...patch,
  });

  const { error: ministryError } = await supabase.from("ministries").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("owner_id", userId);
  if (ministryError && ministryError.code !== "42P01") console.error("[stripe.webhook] Falha ao cancelar ministério", ministryError);

  return {
    localSubscriptionId: saveResponse.data?.[0]?.id ?? previous.id ?? null,
    planId,
    planSlug: previous.planSlug ?? fallbackPlan?.slug ?? null,
    previous,
  };
}

function mapStripeEventToWebhookEvent(eventType: string, status: string) {
  if (eventType === "checkout.session.completed") return "checkout.completed";
  if (eventType === "checkout.session.expired") return "checkout.abandoned";
  if (eventType === "customer.subscription.created") return "subscription.created";
  if (eventType === "customer.subscription.deleted") return "subscription.canceled";
  if (["invoice.paid", "invoice.payment_succeeded"].includes(eventType)) return "payment.approved";
  if (isStripePaymentFailureEvent(eventType)) return "subscription.payment_failed";
  if (eventType === "charge.refunded") return "payment.refunded";
  if (eventType === "charge.dispute.created") return "payment.chargeback";
  if (eventType === "customer.subscription.updated" && isActiveSubscriptionStatus(status)) return "subscription.renewed";
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

function getCheckoutAbandonedEvent(planSlug?: string | null) {
  const family = normalizePlanFamily(planSlug);
  if (family === "plus") return "checkout.plus.abandoned";
  if (family === "premium") return "checkout.premium.abandoned";
  return null;
}

function shouldDispatchPlanActivated(eventType: string, context: NonNullable<SyncedSubscriptionContext>) {
  if (!isActiveSubscriptionStatus(context.status)) return false;
  const currentPlan = normalizePlanFamily(context.planSlug);
  const previousPlan = normalizePlanFamily(context.previousPlanSlug);
  if (!currentPlan || currentPlan === "free") return false;
  if (eventType === "checkout.session.completed") return true;
  if (eventType === "customer.subscription.created") return false;
  if (["invoice.paid", "invoice.payment_succeeded"].includes(eventType)) return previousPlan !== currentPlan;
  return eventType === "customer.subscription.updated" && previousPlan !== currentPlan;
}

function planRank(slug?: string | null) {
  const family = normalizePlanFamily(slug);
  if (family === "free") return 0;
  if (family === "plus") return 1;
  if (family === "premium") return 2;
  if (family === "ministry") return 3;
  return -1;
}

function getSpecificPlanTransitionEvent(fromSlug?: string | null, toSlug?: string | null) {
  const from = normalizePlanFamily(fromSlug);
  const to = normalizePlanFamily(toSlug);
  if (!from || !to || from === to) return null;
  const direction = planRank(to) > planRank(from) ? "upgrade" : "downgrade";
  const key = `${from}_to_${to}`;
  const allowed = new Set(["free_to_plus", "free_to_premium", "plus_to_premium", "premium_to_plus", "premium_to_free", "plus_to_free"]);
  if (!allowed.has(key)) return null;
  return `${direction}.${key}` as WebhookEvent;
}

function getHistoryChangeType(eventType: string, context: NonNullable<SyncedSubscriptionContext>) {
  if (eventType === "customer.subscription.deleted") return "canceled";
  if (isStripePaymentFailureEvent(eventType)) return "payment_failed";
  if (["invoice.paid", "invoice.payment_succeeded"].includes(eventType)) return "renewed";
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
  const { error } = await supabase.from("subscription_history").upsert(payload, { onConflict: "provider_event_id", ignoreDuplicates: true });
  if (error && error.code !== "42P01") console.error("[stripe.webhook] Falha ao registrar subscription_history", error);
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
    normalize(object.billing_details?.email) ??
    normalize(object.receipt_email) ??
    normalize(object.customer_email) ??
    normalize(object.customer_details?.email) ??
    normalize(object.email);
  const metadataUserId = normalize(fullSubscription?.metadata?.user_id) ?? normalize(object.metadata?.user_id) ?? normalize(object.subscription_details?.metadata?.user_id);
  const metadataPlanSlug = normalizeLower(fullSubscription?.metadata?.plan_slug) ?? normalizeLower(object.metadata?.plan_slug) ?? normalizeLower(object.subscription_details?.metadata?.plan_slug);
  const stripeMetadata = { ...(object.subscription_details?.metadata ?? {}), ...(object.metadata ?? {}), ...(fullSubscription?.metadata ?? {}) } as Record<string, unknown>;
  const metadataPreviousPlanSlug = normalizeLower(stripeMetadata.previous_plan_slug);
  const userId = metadataUserId ?? (await ensureUserIdByCustomerOrEmail(supabase, customerId, customerEmail));

  if (!userId) {
    console.error("[stripe.webhook] Usuário não localizado para evento Stripe", { eventId: event.id, eventType: event.type, customerId });
    return null;
  }

  const { data: profile, error: profileError } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (profileError) console.error("[stripe.webhook] Falha ao confirmar profile", profileError);
  if (!profile?.id) {
    console.error("[stripe.webhook] Profile não encontrado para assinatura Stripe", { eventId: event.id, userId });
    return null;
  }

  const status = mapStripeStatus(fullSubscription?.status ?? object.status ?? "active");
  const currentPeriodEnd = toIsoFromStripeSeconds(fullSubscription?.current_period_end);
  const trialEndsAt = toIsoFromStripeSeconds(fullSubscription?.trial_end);
  const fullSubscriptionId = String(fullSubscription?.id ?? "").startsWith("sub_") ? normalize(fullSubscription.id) : null;
  const syncedSubscriptionId = fullSubscriptionId ?? subscriptionId;
  const previous = await getCurrentSubscriptionForHistory(supabase, userId);
  if (shouldIgnoreStripeEventForCurrentNonStripeSubscription(event.type) && isCurrentActiveNonStripeSubscription(previous)) {
    console.info("[stripe.webhook] Evento Stripe ignorado porque assinatura atual ativa usa outro gateway", {
      eventId: event.id,
      eventType: event.type,
      userId,
      currentGateway: previous.gateway,
      currentStatus: previous.status,
      currentPeriodEnd: previous.currentPeriodEnd,
    });
    return null;
  }
  const preservedCustomerId = customerId ?? previous.customerId;
  const preservedSubscriptionId = syncedSubscriptionId ?? previous.subscriptionId;

  const plan = await getPlanByStripePriceId(supabase, stripePriceId, metadataPlanSlug);
  if (!plan?.id && !previous.planId) {
    console.error("[stripe.webhook] Plano não encontrado para evento Stripe", { eventId: event.id, stripePriceId, metadataPlanSlug });
    return null;
  }

  if (["customer.subscription.deleted", "checkout.session.expired"].includes(event.type) || isStripePaymentFailureEvent(event.type)) {
    const inactiveStatus = event.type === "customer.subscription.deleted"
      ? "canceled"
      : event.type === "checkout.session.expired"
        ? "expired"
        : isActiveSubscriptionStatus(status)
          ? "past_due"
          : status;
    const inactiveAt = ["customer.subscription.deleted", "checkout.session.expired"].includes(event.type) ? new Date().toISOString() : null;
    const inactiveSubscription = await markSubscriptionWithoutActiveAccess(supabase, userId, {
      status: inactiveStatus,
      gateway: "stripe",
      stripe_customer_id: preservedCustomerId,
      gateway_customer_id: preservedCustomerId,
      stripe_subscription_id: preservedSubscriptionId,
      gateway_subscription_id: preservedSubscriptionId,
      stripe_price_id: stripePriceId,
      current_period_end: currentPeriodEnd,
      trial_ends_at: trialEndsAt,
      next_billing_at: null,
      canceled_at: inactiveAt,
      auto_renew: false,
      last_webhook_event: event.type,
      updated_at: new Date().toISOString(),
    }, plan ?? null);

    return {
      userId,
      planId: event.type === "checkout.session.expired" ? plan?.id ?? inactiveSubscription?.planId ?? previous.planId ?? null : inactiveSubscription?.planId ?? previous.planId ?? plan?.id ?? null,
      planSlug: event.type === "checkout.session.expired" ? plan?.slug ?? inactiveSubscription?.planSlug ?? previous.planSlug ?? null : inactiveSubscription?.planSlug ?? previous.planSlug ?? plan?.slug ?? null,
      previousPlanId: inactiveSubscription?.previous.planId ?? previous.planId,
      previousPlanSlug: metadataPreviousPlanSlug ?? inactiveSubscription?.previous.planSlug ?? previous.planSlug,
      status: isStripePaymentFailureEvent(event.type) ? "payment_failed" : inactiveStatus,
      customerId: preservedCustomerId,
      subscriptionId: preservedSubscriptionId,
      localSubscriptionId: inactiveSubscription?.localSubscriptionId ?? previous.id ?? null,
      stripePriceId,
      customerEmail,
      currentPeriodEnd,
      trialEndsAt,
      metadata: stripeMetadata,
    };
  }

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
    next_billing_at: isActiveSubscriptionStatus(status) ? currentPeriodEnd : null,
    auto_renew: !Boolean(fullSubscription?.cancel_at_period_end) && isActiveSubscriptionStatus(status),
    cancel_at_period_end: Boolean(fullSubscription?.cancel_at_period_end),
    canceled_at: status === "canceled" ? new Date().toISOString() : null,
    last_webhook_event: event.type,
    updated_at: new Date().toISOString(),
  });

  if (saveResponse.error) return null;
  const localSubscriptionId = saveResponse.data?.[0]?.id ?? previous.id ?? null;

  try {
    await ensureMinistryForSubscription({ userId, planSlug: plan.slug ?? null, subscriptionId: localSubscriptionId, stripeCustomerId: customerId, stripeSubscriptionId: syncedSubscriptionId, status, currentPeriodEnd, trialEndsAt });
  } catch (ministryError) {
    console.error("[stripe.webhook] Falha ao sincronizar central ministerial", ministryError);
  }

  return {
    userId,
    planId: plan.id ?? null,
    planSlug: plan.slug ?? null,
    previousPlanId: previous.planId,
    previousPlanSlug: metadataPreviousPlanSlug ?? previous.planSlug,
    status,
    customerId,
    subscriptionId: syncedSubscriptionId,
    localSubscriptionId,
    stripePriceId,
    customerEmail,
    currentPeriodEnd,
    trialEndsAt,
    metadata: stripeMetadata,
  };
}

async function saveBillingInvoiceFromStripeEvent(supabase: any, event: StripeEvent, context: SyncedSubscriptionContext) {
  if (!["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"].includes(event.type)) return;
  const invoice = event.data?.object ?? {};
  const providerInvoiceId = normalize(invoice.id);
  if (!providerInvoiceId) return;
  const stripeCustomerId = getStripeId(invoice.customer) ?? context?.customerId ?? null;
  const stripeSubscriptionId = getStripeId(invoice.subscription) ?? context?.subscriptionId ?? null;
  const stripePriceId = invoice.lines?.data?.[0]?.price?.id ?? context?.stripePriceId ?? null;
  const customerEmail = normalize(invoice.customer_email) ?? normalize(invoice.customer_details?.email) ?? context?.customerEmail ?? null;
  const userId = context?.userId ?? (await ensureUserIdByCustomerOrEmail(supabase, stripeCustomerId, customerEmail));
  const plan = await getPlanByStripePriceId(supabase, stripePriceId, null);
  const period = invoice.lines?.data?.[0]?.period ?? {};
  const status = normalizeLower(invoice.status) ?? (["invoice.paid", "invoice.payment_succeeded"].includes(event.type) ? "paid" : "payment_failed");
  const paidAt = toIsoFromStripeSeconds(invoice.status_transitions?.paid_at) ?? (["invoice.paid", "invoice.payment_succeeded"].includes(event.type) ? toIsoFromStripeSeconds(invoice.created) : null);
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
    amount_paid_cents: ["invoice.paid", "invoice.payment_succeeded"].includes(event.type) ? cents(invoice.amount_paid) : 0,
    amount_remaining_cents: cents(invoice.amount_remaining),
    invoice_url: normalize(invoice.invoice_pdf),
    hosted_invoice_url: normalize(invoice.hosted_invoice_url),
    paid_at: paidAt,
    period_start: toIsoFromStripeSeconds(period.start),
    period_end: toIsoFromStripeSeconds(period.end),
    raw_payload: invoice,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("billing_invoices").upsert(payload, { onConflict: "provider,provider_invoice_id" });
  if (error) console.error("[stripe.webhook] Falha ao salvar billing_invoice", error);
}

async function trackCheckoutAbandonedForAutomation(supabase: any, event: StripeEvent, context: SyncedSubscriptionContext) {
  if (event.type !== "checkout.session.expired" || !context?.userId) return;

  await trackMarketingEvent(supabase, {
    userId: context.userId,
    eventKey: "checkout_abandoned",
    eventLabel: "Checkout abandonado",
    channel: "billing",
    source: "stripe",
    metadata: {
      stripe_event_id: event.id,
      stripe_customer_id: context.customerId,
      plan_slug: context.planSlug,
      stripe_event_type: event.type,
      stripe_subscription_id: context.subscriptionId,
      stripe_price_id: context.stripePriceId,
      local_subscription_id: context.localSubscriptionId,
      previous_plan: context.previousPlanSlug,
      status: context.status,
    },
  });
}

async function trackPaymentFailedForAutomation(supabase: any, event: StripeEvent, context: SyncedSubscriptionContext) {
  if (!isStripePaymentFailureEvent(event.type) || !context?.userId) return;

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existingEvent, error } = await supabase
    .from("marketing_events")
    .select("id")
    .eq("event_key", "payment_failed")
    .eq("user_id", context.userId)
    .gte("created_at", twentyFourHoursAgo)
    .limit(1)
    .maybeSingle();

  if (error) console.error("[stripe.webhook] Falha ao verificar marketing_event payment_failed duplicado", error);
  if (existingEvent?.id) return;

  await trackMarketingEvent(supabase, {
    userId: context.userId,
    eventKey: "payment_failed",
    eventLabel: "Pagamento falhou",
    channel: "billing",
    metadata: {
      stripe_event_type: event.type,
      stripe_event_id: event.id,
      stripe_customer_id: context.customerId,
      stripe_subscription_id: context.subscriptionId,
      payment_failure_source: event.type,
      stripe_price_id: context.stripePriceId,
      local_subscription_id: context.localSubscriptionId,
      previous_plan: context.previousPlanSlug,
      status: context.status,
    },
  });
}

async function hasRecentSubscriptionPaymentFailedWebhook(supabase: any, context: NonNullable<SyncedSubscriptionContext>, email: string | null) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  if (context.userId) {
    const { data: existingByUser, error } = await supabase
      .from("webhook_logs")
      .select("id")
      .eq("event", "subscription.payment_failed")
      .eq("request_body->data->>user_id", context.userId)
      .gte("created_at", twentyFourHoursAgo)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "42P01") console.error("[stripe.webhook] Falha ao verificar webhook payment_failed duplicado por usuário", error);
    if (existingByUser?.id) return true;
  }

  if (email) {
    const { data: existingByEmail, error } = await supabase
      .from("webhook_logs")
      .select("id")
      .eq("event", "subscription.payment_failed")
      .eq("request_body->data->>email", email)
      .gte("created_at", twentyFourHoursAgo)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "42P01") console.error("[stripe.webhook] Falha ao verificar webhook payment_failed duplicado por e-mail", error);
    if (existingByEmail?.id) return true;
  }

  return false;
}

async function dispatchStripeWebhookEvent(supabase: any, event: StripeEvent, context: SyncedSubscriptionContext) {
  if (!context) return;
  const webhookEvent = mapStripeEventToWebhookEvent(event.type, context.status);
  if (!webhookEvent) return;
  const recipient = await resolveWebhookRecipientForUser(supabase, context.userId, { email: context.customerEmail, metadata: context.metadata, phone: context.metadata?.phone as string | null | undefined, full_name: context.metadata?.full_name as string | null | undefined, username: context.metadata?.username as string | null | undefined });
  const missingPhoneDiagnostic = recipient.phone ? null : "missing_phone_for_paid_webhook";
  if (missingPhoneDiagnostic) console.warn("[stripe.webhook] missing_phone_for_paid_webhook", { eventId: event.id, eventType: event.type, userId: context.userId });
  const data = { stripe_event_id: event.id, stripe_event_type: event.type, user_id: context.userId, plan: context.planSlug, previous_plan: context.previousPlanSlug, status: context.status, stripe_customer_id: context.customerId, stripe_subscription_id: context.subscriptionId, stripe_price_id: context.stripePriceId, current_period_end: context.currentPeriodEnd, trial_ends_at: context.trialEndsAt, email: recipient.email, phone: recipient.phone, phone_source: recipient.phone_source, diagnostic: missingPhoneDiagnostic };
  const extraEvents = [event.type === "checkout.session.completed" ? getCheckoutCompletedEvent(context.planSlug) : null, event.type === "checkout.session.expired" ? getCheckoutAbandonedEvent(context.planSlug) : null, getSpecificPlanTransitionEvent(context.previousPlanSlug, context.planSlug), shouldDispatchPlanActivated(event.type, context) ? getPlanActivatedEvent(context.planSlug) : null].filter(Boolean) as WebhookEvent[];
  let events = Array.from(new Set([webhookEvent as WebhookEvent, ...extraEvents]));

  if (events.includes("subscription.payment_failed")) {
    const hasRecentDuplicate = await hasRecentSubscriptionPaymentFailedWebhook(supabase, context, recipient.email ?? context.customerEmail);
    if (hasRecentDuplicate) {
      console.info("[stripe.webhook] subscription.payment_failed não disparado por duplicidade nas últimas 24h", { eventId: event.id, userId: context.userId, email: recipient.email ?? context.customerEmail });
      events = events.filter((eventName) => eventName !== "subscription.payment_failed");
    }
  }

  await Promise.allSettled(events.map((eventName) => dispatchWebhookEvent({ event: eventName, source: "stripe", recipient, data })));
}

async function getExistingBillingEvent(supabase: any, eventId: string) {
  const { data, error } = await supabase.from("billing_events").select("id, processed").eq("provider", "stripe").eq("payload->>id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle();
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
  if (existingBillingEvent?.processed) return NextResponse.json({ received: true, duplicate: true });
  const billingEventResponse = existingBillingEvent?.id ? { data: [{ id: existingBillingEvent.id }], error: null } : await supabase.from("billing_events").insert({ provider: "stripe", event_type: event.type, payload: event, processed: false }).select("id");
  if (billingEventResponse.error) console.error("[stripe.webhook] Falha ao registrar billing_event", billingEventResponse.error);
  if (ACCEPTED_EVENTS.has(event.type)) {
    const context = await syncSubscriptionFromStripeEvent(supabase, event);
    await recordSubscriptionHistoryFromStripe(supabase, event, context);
    await saveBillingInvoiceFromStripeEvent(supabase, event, context);
    await trackPaymentFailedForAutomation(supabase, event, context);
    await trackCheckoutAbandonedForAutomation(supabase, event, context);
    await dispatchStripeWebhookEvent(supabase, event, context);
  }
  const billingEventId = billingEventResponse.data?.[0]?.id ?? existingBillingEvent?.id;
  const billingUpdateQuery = supabase.from("billing_events").update({ processed: true });
  const billingUpdateResponse = billingEventId ? await billingUpdateQuery.eq("id", billingEventId) : await billingUpdateQuery.eq("provider", "stripe").eq("payload->>id", event.id);
  if (billingUpdateResponse.error) console.error("[stripe.webhook] Falha ao marcar billing_event como processado", billingUpdateResponse.error);
  return NextResponse.json({ received: true });
}
