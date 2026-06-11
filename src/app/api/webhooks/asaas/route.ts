import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { trackMarketingEvent } from "@/lib/communications/events";
import { ensureMinistryForSubscription } from "@/lib/data/ministry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";
import { resolveWebhookRecipientForUser } from "@/lib/webhooks/recipient";
import type { WebhookEvent } from "@/types/webhooks";

const HANDLED_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
]);

type AsaasWebhookPayment = {
  id?: string;
  customer?: string;
  subscription?: string;
  status?: string;
  dueDate?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  value?: number;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  externalReference?: string | null;
};

type AsaasWebhookSubscription = {
  id?: string;
  customer?: string;
  status?: string;
  nextDueDate?: string;
  externalReference?: string | null;
  deleted?: boolean;
};

type AsaasWebhookPayload = {
  id?: string;
  event?: string;
  dateCreated?: string;
  payment?: AsaasWebhookPayment;
  subscription?: AsaasWebhookSubscription;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  status?: string | null;
  plan_id?: string | null;
  gateway_subscription_id?: string | null;
  gateway_customer_id?: string | null;
  plans?: { slug?: string | null } | null;
};

function validateWebhookToken(req: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!expected) throw new Error("Configuração ausente: ASAAS_WEBHOOK_TOKEN.");

  const received = req.headers.get("asaas-access-token")?.trim() ?? "";
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function isPayload(value: unknown): value is AsaasWebhookPayload {
  if (!value || typeof value !== "object") return false;
  const event = (value as { event?: unknown }).event;
  return typeof event === "string" && event.trim().length > 0;
}

function parseAsaasDate(value?: string | null) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addMonths(value: string, months: number) {
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function nextMonthlyDate(dueDate?: string | null) {
  const due = parseAsaasDate(dueDate);
  return due ? addMonths(due, 1) : null;
}

function gatewaySubscriptionId(payload: AsaasWebhookPayload) {
  return payload.subscription?.id ?? payload.payment?.subscription ?? null;
}

function gatewayCustomerId(payload: AsaasWebhookPayload) {
  return payload.subscription?.customer ?? payload.payment?.customer ?? null;
}

function externalUserId(payload: AsaasWebhookPayload) {
  return payload.subscription?.externalReference ?? payload.payment?.externalReference ?? null;
}

function normalizeLower(value: unknown) {
  return String(value ?? "").trim().toLowerCase() || null;
}

function isConfirmedPaymentEvent(event: string, payload: AsaasWebhookPayload) {
  const paymentStatus = normalizeLower(payload.payment?.status);
  return (
    event === "PAYMENT_RECEIVED" ||
    event === "PAYMENT_CONFIRMED" ||
    paymentStatus === "received" ||
    paymentStatus === "confirmed"
  );
}

function statusForEvent(event: string, payload?: AsaasWebhookPayload) {
  const paymentStatus = normalizeLower(payload?.payment?.status);
  if (payload && isConfirmedPaymentEvent(event, payload)) return "active";
  if (event === "PAYMENT_OVERDUE" || paymentStatus === "overdue") return "overdue";
  if (event === "PAYMENT_DELETED" || event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED" || payload?.subscription?.deleted) return "canceled";
  return null;
}

async function findSubscription(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  payload: AsaasWebhookPayload,
) {
  const asaasSubscriptionId = gatewaySubscriptionId(payload);
  const asaasCustomerId = gatewayCustomerId(payload);
  const userId = externalUserId(payload);

  if (asaasSubscriptionId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,user_id,status,plan_id,gateway_subscription_id,gateway_customer_id,plans(slug)")
      .eq("gateway", "asaas")
      .eq("gateway_subscription_id", asaasSubscriptionId)
      .maybeSingle();
    if (error) throw new Error(`Falha ao localizar assinatura Asaas: ${error.message}`);
    if (data) return data as SubscriptionRow;
  }

  if (asaasCustomerId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,user_id,status,plan_id,gateway_subscription_id,gateway_customer_id,plans(slug)")
      .eq("gateway", "asaas")
      .eq("gateway_customer_id", asaasCustomerId)
      .maybeSingle();
    if (error) throw new Error(`Falha ao localizar customer Asaas: ${error.message}`);
    if (data) return data as SubscriptionRow;
  }

  if (userId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,user_id,status,plan_id,gateway_subscription_id,gateway_customer_id,plans(slug)")
      .eq("gateway", "asaas")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Falha ao localizar assinatura Asaas por usuário: ${error.message}`);
    if (data) return data as SubscriptionRow;
  }

  return null;
}

function buildUpdatePayload(event: string, payload: AsaasWebhookPayload, freePlanId?: string | null) {
  const status = statusForEvent(event, payload);
  const paymentDueDate = payload.payment?.dueDate;
  const subscriptionDueDate = payload.subscription?.nextDueDate;
  const active = status === "active";
  const canceled = status === "canceled";
  const created = event === "PAYMENT_CREATED";
  const baseDueDate = subscriptionDueDate ?? paymentDueDate;
  const nextBillingDate = active ? nextMonthlyDate(paymentDueDate) : parseAsaasDate(baseDueDate);

  return {
    gateway: "asaas",
    gateway_customer_id: gatewayCustomerId(payload),
    gateway_subscription_id: gatewaySubscriptionId(payload),
    plan_id: status === "canceled" && freePlanId ? freePlanId : undefined,
    status: status ?? undefined,
    current_period_end: active ? nextBillingDate : created ? undefined : parseAsaasDate(baseDueDate),
    next_billing_at: canceled ? null : nextBillingDate,
    auto_renew: canceled ? false : undefined,
    last_webhook_event: event,
    starts_at: active ? new Date().toISOString() : undefined,
    updated_at: new Date().toISOString(),
  };
}

function normalizePlanFamily(slug?: string | null) {
  if (!slug) return null;
  if (slug.startsWith("ministry")) return "ministry";
  if (["free", "plus", "premium"].includes(slug)) return slug;
  return null;
}

function planRank(slug?: string | null) {
  const family = normalizePlanFamily(slug);
  if (family === "free") return 0;
  if (family === "plus") return 1;
  if (family === "premium") return 2;
  if (family === "ministry") return 3;
  return -1;
}

function getPlanActivatedEvent(planSlug?: string | null) {
  const family = normalizePlanFamily(planSlug);
  if (family === "plus") return "plan.plus_activated";
  if (family === "premium") return "plan.premium_activated";
  if (family === "ministry") return "plan.ministry_activated";
  return null;
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

function asaasExternalEventId(payload: AsaasWebhookPayload) {
  return payload.id ?? payload.payment?.id ?? payload.subscription?.id ?? gatewaySubscriptionId(payload) ?? null;
}

function asaasPaymentId(payload: AsaasWebhookPayload) {
  return payload.payment?.id ?? (payload.event?.startsWith("PAYMENT_") ? payload.id ?? null : null);
}

function asaasOccurredAt(payload: AsaasWebhookPayload) {
  return parseAsaasDate(payload.payment?.clientPaymentDate) ?? parseAsaasDate(payload.payment?.paymentDate) ?? parseAsaasDate(payload.dateCreated) ?? new Date().toISOString();
}

function isActivationEvent(event: string, payload: AsaasWebhookPayload, status: string | null) {
  return status === "active" && isConfirmedPaymentEvent(event, payload);
}

function isCancellationEvent(status: string | null) {
  return status === "canceled";
}

function currentPlanSlug(subscription: SubscriptionRow) {
  return normalizeLower(subscription.plans?.slug) ?? "free";
}

async function getPlanBySlug(supabase: ReturnType<typeof createSupabaseAdminClient>, slug: string) {
  const { data, error } = await supabase.from("plans").select("id, slug").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Falha ao buscar plano ${slug}: ${error.message}`);
  return data ?? null;
}

async function getPreviousPlanSlugFromCheckoutLog(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  subscriptionId: string | null,
) {
  if (!subscriptionId) return null;

  const { data, error } = await supabase
    .from("billing_events")
    .select("payload")
    .eq("provider", "asaas")
    .eq("event_type", "checkout.asaas.started")
    .eq("payload->>gateway_subscription_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error("[asaas.webhook] Falha ao buscar plano anterior no checkout", error);
  return normalizeLower((data?.payload as Record<string, unknown> | undefined)?.previous_plan_slug);
}

async function getEffectivePreviousPlanSlug(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  subscription: SubscriptionRow,
  payload: AsaasWebhookPayload,
) {
  const loggedPreviousPlan = await getPreviousPlanSlugFromCheckoutLog(supabase, gatewaySubscriptionId(payload));
  if (loggedPreviousPlan) return loggedPreviousPlan;

  const planSlug = currentPlanSlug(subscription);
  const status = normalizeLower(subscription.status);
  if (!["active", "trialing", "overdue"].includes(status ?? "") && planSlug !== "free") return "free";
  return planSlug;
}

async function hasProcessedAsaasBillingEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  payload: AsaasWebhookPayload,
) {
  const externalEventId = asaasExternalEventId(payload);
  if (!externalEventId || !payload.event) return false;

  const { data, error } = await supabase
    .from("billing_events")
    .select("id, processed")
    .eq("provider", "asaas")
    .eq("event_type", payload.event)
    .eq("payload->>external_event_id", externalEventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error("[asaas.webhook] Falha ao verificar idempotência do evento", error);
  return Boolean(data?.processed);
}

async function hasDispatchedAsaasEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: { eventName: WebhookEvent; externalEventId: string | null; paymentId: string | null; subscriptionId: string | null; userId: string; localSubscriptionId: string },
) {
  const identity = input.paymentId ?? input.externalEventId ?? input.subscriptionId;
  if (!identity) return false;

  const { data, error } = await supabase
    .from("billing_events")
    .select("id")
    .eq("provider", "asaas")
    .eq("event_type", `webhook_dispatch:${input.eventName}`)
    .eq("payload->>idempotency_key", `${input.eventName}:${identity}:${input.userId}:${input.localSubscriptionId}`)
    .limit(1)
    .maybeSingle();

  if (error) console.error("[asaas.webhook] Falha ao verificar idempotência do dispatch", error);
  return Boolean(data?.id);
}

async function markAsaasEventDispatched(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: { eventName: WebhookEvent; externalEventId: string | null; paymentId: string | null; subscriptionId: string | null; userId: string; localSubscriptionId: string; payload: Record<string, unknown> },
) {
  const identity = input.paymentId ?? input.externalEventId ?? input.subscriptionId;
  const { error } = await supabase.from("billing_events").insert({
    provider: "asaas",
    event_type: `webhook_dispatch:${input.eventName}`,
    payload: {
      ...input.payload,
      idempotency_key: `${input.eventName}:${identity ?? "unknown"}:${input.userId}:${input.localSubscriptionId}`,
      external_event_id: input.externalEventId,
      payment_id: input.paymentId,
      gateway_subscription_id: input.subscriptionId,
      user_id: input.userId,
      subscription_id: input.localSubscriptionId,
    },
    processed: true,
    processed_at: new Date().toISOString(),
  });

  if (error && error.code !== "23505") console.error("[asaas.webhook] Falha ao registrar dispatch no billing_events", error);
}

async function dispatchAsaasWebhookEvents(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  payload: AsaasWebhookPayload;
  subscription: SubscriptionRow;
  previousPlanSlug: string;
  nextPlanSlug: string;
  status: string;
  events: WebhookEvent[];
}) {
  if (!input.events.length) return;

  const recipient = await resolveWebhookRecipientForUser(input.supabase, input.subscription.user_id, {});
  const externalEventId = asaasExternalEventId(input.payload);
  const paymentId = asaasPaymentId(input.payload);
  const providerSubscriptionId = gatewaySubscriptionId(input.payload) ?? input.subscription.gateway_subscription_id ?? null;
  const occurredAt = asaasOccurredAt(input.payload);
  const dispatchPayload = {
    userId: input.subscription.user_id,
    user_id: input.subscription.user_id,
    email: recipient.email,
    fullName: recipient.name,
    name: recipient.name,
    phone: recipient.phone,
    whatsapp: recipient.phone,
    planSlug: input.nextPlanSlug,
    plan_slug: input.nextPlanSlug,
    previousPlanSlug: input.previousPlanSlug,
    previous_plan_slug: input.previousPlanSlug,
    nextPlanSlug: input.nextPlanSlug,
    next_plan_slug: input.nextPlanSlug,
    provider: "asaas",
    paymentId,
    payment_id: paymentId,
    subscriptionId: providerSubscriptionId,
    gateway_subscription_id: providerSubscriptionId,
    localSubscriptionId: input.subscription.id,
    value: input.payload.payment?.value,
    amount: input.payload.payment?.value,
    status: input.status,
    occurredAt,
    occurred_at: occurredAt,
    asaas_event_id: externalEventId,
    asaas_event_type: input.payload.event,
    phone_source: recipient.phone_source,
  };

  for (const eventName of Array.from(new Set(input.events))) {
    const alreadyDispatched = await hasDispatchedAsaasEvent(input.supabase, {
      eventName,
      externalEventId,
      paymentId,
      subscriptionId: providerSubscriptionId,
      userId: input.subscription.user_id,
      localSubscriptionId: input.subscription.id,
    });
    if (alreadyDispatched) continue;

    await dispatchWebhookEvent({ event: eventName, source: "asaas", recipient, data: dispatchPayload });
    await markAsaasEventDispatched(input.supabase, {
      eventName,
      externalEventId,
      paymentId,
      subscriptionId: providerSubscriptionId,
      userId: input.subscription.user_id,
      localSubscriptionId: input.subscription.id,
      payload: dispatchPayload,
    });
  }
}

async function markEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  payload: AsaasWebhookPayload,
  processed: boolean,
  errorMessage?: string,
) {
  const { error } = await supabase.from("billing_events").insert({
    provider: "asaas",
    event_type: payload.event ?? "unknown",
    payload: { ...(payload as unknown as Record<string, unknown>), external_event_id: asaasExternalEventId(payload) },
    processed,
    processed_at: processed ? new Date().toISOString() : null,
    error_message: errorMessage ?? null,
  });

  if (error && error.code !== "23505") console.error("[asaas.webhook] Falha ao registrar billing_event", error);
}

function getPrimaryCustomerEvent(previousPlanSlug: string, nextPlanSlug: string) {
  return getSpecificPlanTransitionEvent(previousPlanSlug, nextPlanSlug) ?? getPlanActivatedEvent(nextPlanSlug);
}

async function trackAsaasCheckoutStarted(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  payload: AsaasWebhookPayload;
  subscription: SubscriptionRow;
  planSlug: string;
}) {
  if (input.payload.event !== "PAYMENT_CREATED") return;

  await trackMarketingEvent(input.supabase, {
    userId: input.subscription.user_id,
    eventKey: "checkout_started",
    eventLabel: "Checkout iniciado",
    channel: "billing",
    source: "asaas",
    metadata: {
      provider: "asaas",
      asaas_event_id: asaasExternalEventId(input.payload),
      asaas_event_type: input.payload.event,
      asaas_customer_id: gatewayCustomerId(input.payload),
      asaas_payment_id: asaasPaymentId(input.payload),
      asaas_subscription_id: gatewaySubscriptionId(input.payload) ?? input.subscription.gateway_subscription_id ?? null,
      local_subscription_id: input.subscription.id,
      plan_slug: input.planSlug,
      amount: input.payload.payment?.value ?? null,
      due_date: input.payload.payment?.dueDate ?? null,
      occurred_at: asaasOccurredAt(input.payload),
    },
  });
}

async function trackAsaasPaymentConversion(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  payload: AsaasWebhookPayload;
  subscription: SubscriptionRow;
  planSlug: string;
}) {
  if (!input.payload.event || !isConfirmedPaymentEvent(input.payload.event, input.payload)) return;

  await trackMarketingEvent(input.supabase, {
    userId: input.subscription.user_id,
    eventKey: "payment_succeeded",
    eventLabel: "Pagamento confirmado",
    channel: "billing",
    source: "asaas",
    metadata: {
      provider: "asaas",
      asaas_event_id: asaasExternalEventId(input.payload),
      asaas_event_type: input.payload.event,
      asaas_customer_id: gatewayCustomerId(input.payload),
      asaas_payment_id: asaasPaymentId(input.payload),
      asaas_subscription_id: gatewaySubscriptionId(input.payload) ?? input.subscription.gateway_subscription_id ?? null,
      local_subscription_id: input.subscription.id,
      plan_slug: input.planSlug,
      amount: input.payload.payment?.value ?? null,
      payment_date: input.payload.payment?.paymentDate ?? input.payload.payment?.clientPaymentDate ?? null,
      occurred_at: asaasOccurredAt(input.payload),
    },
  });
}

export async function POST(req: Request) {
  let payload: AsaasWebhookPayload | null = null;
  const supabase = createSupabaseAdminClient();

  try {
    if (!validateWebhookToken(req)) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

    const body = await req.json() as unknown;
    if (!isPayload(body)) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    payload = body;

    const event = payload.event!;
    const duplicateEvent = await hasProcessedAsaasBillingEvent(supabase, payload);
    if (duplicateEvent) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (!HANDLED_EVENTS.has(event)) {
      await markEvent(supabase, payload, true);
      return NextResponse.json({ received: true, ignored: true });
    }

    if (!payload.payment && !payload.subscription) {
      await markEvent(supabase, payload, false, "Payload sem payment ou subscription.");
      return NextResponse.json({ error: "Payload sem assinatura ou cobrança." }, { status: 400 });
    }

    const subscription = await findSubscription(supabase, payload);
    if (!subscription?.id) {
      await markEvent(supabase, payload, false, "Assinatura local Asaas não encontrada.");
      return NextResponse.json({ received: true, synced: false });
    }

    const status = statusForEvent(event, payload);
    const previousPlanSlug = await getEffectivePreviousPlanSlug(supabase, subscription, payload);
    const currentSlug = currentPlanSlug(subscription);
    const nextPlanSlug = isCancellationEvent(status) ? "free" : currentSlug;
    const freePlan = nextPlanSlug === "free" ? await getPlanBySlug(supabase, "free") : null;
    const updatePayload = buildUpdatePayload(event, payload, freePlan?.id ?? null);
    const sanitizedPayload = Object.fromEntries(Object.entries(updatePayload).filter(([, value]) => value !== undefined));
    const { error } = await supabase.from("subscriptions").update(sanitizedPayload).eq("id", subscription.id).eq("gateway", "asaas");
    if (error) throw new Error(`Falha ao sincronizar assinatura Asaas: ${error.message}`);

    if (isActivationEvent(event, payload, status)) {
      try {
        await ensureMinistryForSubscription({
          userId: subscription.user_id,
          planSlug: nextPlanSlug,
          subscriptionId: subscription.id,
          status: status ?? "active",
          currentPeriodEnd: sanitizedPayload.current_period_end as string | null | undefined,
        });
      } catch (ministryError) {
        console.error("[asaas.webhook] Falha ao sincronizar central ministerial", ministryError);
      }
    }

    await trackAsaasCheckoutStarted({ supabase, payload, subscription, planSlug: nextPlanSlug });
    await trackAsaasPaymentConversion({ supabase, payload, subscription, planSlug: nextPlanSlug });

    const customerEvent = isActivationEvent(event, payload, status)
      ? getPrimaryCustomerEvent(previousPlanSlug, nextPlanSlug)
      : null;
    const dispatchEvents = [
      customerEvent,
      isCancellationEvent(status) ? "subscription.canceled" : null,
      isCancellationEvent(status) ? getSpecificPlanTransitionEvent(previousPlanSlug, nextPlanSlug) : null,
    ].filter(Boolean) as WebhookEvent[];

    await dispatchAsaasWebhookEvents({
      supabase,
      payload,
      subscription,
      previousPlanSlug,
      nextPlanSlug,
      status: status ?? normalizeLower(payload.payment?.status) ?? normalizeLower(payload.subscription?.status) ?? event,
      events: dispatchEvents,
    });

    await markEvent(supabase, payload, true);
    return NextResponse.json({ received: true, synced: true, dispatched: Array.from(new Set(dispatchEvents)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no webhook Asaas.";
    if (payload) await markEvent(supabase, payload, false, message);
    console.error("[asaas.webhook]", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
