import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

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

type AsaasWebhookPayment = { id?: string; customer?: string; subscription?: string; status?: string; dueDate?: string; paymentDate?: string | null; clientPaymentDate?: string | null; value?: number; externalReference?: string | null };
type AsaasWebhookSubscription = { id?: string; customer?: string; status?: string; nextDueDate?: string; externalReference?: string | null; deleted?: boolean };
type AsaasWebhookPayload = { id?: string; event?: string; dateCreated?: string; payment?: AsaasWebhookPayment; subscription?: AsaasWebhookSubscription };
type SubscriptionRow = { id: string; user_id: string; status?: string | null; plan_id?: string | null; gateway_subscription_id?: string | null; gateway_customer_id?: string | null; current_period_end?: string | null; plans?: { slug?: string | null } | null };

function validateWebhookToken(req: Request) { const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim(); if (!expected) throw new Error("Configuração ausente: ASAAS_WEBHOOK_TOKEN."); const received = req.headers.get("asaas-access-token")?.trim() ?? ""; const expectedBuffer = Buffer.from(expected); const receivedBuffer = Buffer.from(received); return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer); }
function isPayload(value: unknown): value is AsaasWebhookPayload { if (!value || typeof value !== "object") return false; const event = (value as { event?: unknown }).event; return typeof event === "string" && event.trim().length > 0; }
function normalizeLower(value: unknown) { return String(value ?? "").trim().toLowerCase() || null; }
function parseAsaasDate(value?: string | null) { if (!value) return null; const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value; const date = new Date(normalized); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function addMonths(value: string, months: number) { const date = new Date(value); date.setUTCMonth(date.getUTCMonth() + months); return date.toISOString(); }
function gatewaySubscriptionId(payload: AsaasWebhookPayload) { return payload.subscription?.id ?? payload.payment?.subscription ?? null; }
function gatewayCustomerId(payload: AsaasWebhookPayload) { return payload.subscription?.customer ?? payload.payment?.customer ?? null; }
function externalUserId(payload: AsaasWebhookPayload) { return payload.subscription?.externalReference ?? payload.payment?.externalReference ?? null; }
function asaasExternalEventId(payload: AsaasWebhookPayload) { return payload.id ?? payload.payment?.id ?? payload.subscription?.id ?? gatewaySubscriptionId(payload) ?? null; }
function asaasPaymentId(payload: AsaasWebhookPayload) { return payload.payment?.id ?? (payload.event?.startsWith("PAYMENT_") ? payload.id ?? null : null); }
function isConfirmedPaymentEvent(event: string, payload: AsaasWebhookPayload) { const paymentStatus = normalizeLower(payload.payment?.status); return event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED" || paymentStatus === "received" || paymentStatus === "confirmed"; }
function isPaymentOverdueEvent(event: string, payload: AsaasWebhookPayload) { const paymentStatus = normalizeLower(payload.payment?.status); return event === "PAYMENT_OVERDUE" || paymentStatus === "overdue"; }
function isSubscriptionCancellationEvent(event: string, payload: AsaasWebhookPayload) { return event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED" || Boolean(payload.subscription?.deleted); }
function normalizePlanFamily(slug?: string | null) { const value = normalizeLower(slug); if (!value) return null; if (value.startsWith("ministry")) return "ministry"; if (["free", "plus", "premium"].includes(value)) return value; return null; }
function planRank(slug?: string | null) { const family = normalizePlanFamily(slug); if (family === "free") return 0; if (family === "plus") return 1; if (family === "premium") return 2; if (family === "ministry") return 3; return -1; }
function currentPlanSlug(subscription: SubscriptionRow) { return normalizeLower(subscription.plans?.slug) ?? "free"; }
function getPlanActivatedEvent(planSlug?: string | null): WebhookEvent | null { const family = normalizePlanFamily(planSlug); if (family === "plus") return "plan.plus_activated"; if (family === "premium") return "plan.premium_activated"; if (family === "ministry") return "plan.ministry_activated"; return null; }
function getSpecificPlanTransitionEvent(fromSlug?: string | null, toSlug?: string | null): WebhookEvent | null { const from = normalizePlanFamily(fromSlug); const to = normalizePlanFamily(toSlug); if (!from || !to || from === to) return null; const key = `${from}_to_${to}`; const allowed = new Set(["free_to_plus", "free_to_premium", "plus_to_premium", "premium_to_plus", "premium_to_free", "plus_to_free"]); if (!allowed.has(key)) return null; return `${planRank(to) > planRank(from) ? "upgrade" : "downgrade"}.${key}` as WebhookEvent; }

async function markEvent(supabase: ReturnType<typeof createSupabaseAdminClient>, payload: AsaasWebhookPayload, processed: boolean, errorMessage?: string, extra: Record<string, unknown> = {}) {
  const { error } = await supabase.from("billing_events").insert({ provider: "asaas", event_type: payload.event ?? "unknown", payload: { ...(payload as unknown as Record<string, unknown>), external_event_id: asaasExternalEventId(payload), ...extra }, processed, processed_at: processed ? new Date().toISOString() : null, error_message: errorMessage ?? null });
  if (error) { if (error.code === "23505") return; throw new Error(`Falha ao registrar billing_event: ${error.message}`); }
}

async function hasProcessedAsaasBillingEvent(supabase: ReturnType<typeof createSupabaseAdminClient>, payload: AsaasWebhookPayload) { const externalEventId = asaasExternalEventId(payload); if (!externalEventId || !payload.event) return false; const { data, error } = await supabase.from("billing_events").select("id, processed").eq("provider", "asaas").eq("event_type", payload.event).eq("payload->>external_event_id", externalEventId).order("created_at", { ascending: false }).limit(1).maybeSingle(); if (error) console.error("[asaas.webhook] Falha ao verificar idempotência", error); return Boolean(data?.processed); }
async function getPlanBySlug(supabase: ReturnType<typeof createSupabaseAdminClient>, slug: string) { const { data, error } = await supabase.from("plans").select("id,slug").eq("slug", slug).maybeSingle(); if (error) throw new Error(`Falha ao buscar plano ${slug}: ${error.message}`); return data ?? null; }
async function getCheckoutPlan(supabase: ReturnType<typeof createSupabaseAdminClient>, subscriptionId: string | null) { if (!subscriptionId) return null; const { data, error } = await supabase.from("billing_events").select("payload").eq("provider", "asaas").eq("event_type", "checkout.asaas.started").eq("payload->>gateway_subscription_id", subscriptionId).order("created_at", { ascending: false }).limit(1).maybeSingle(); if (error) console.error("[asaas.webhook] Falha ao buscar checkout Asaas", error); const payload = data?.payload as Record<string, unknown> | undefined; return { planSlug: normalizeLower(payload?.plan_slug), previousPlanSlug: normalizeLower(payload?.previous_plan_slug), userId: String(payload?.user_id ?? "").trim() || null }; }
async function findExactSubscription(supabase: ReturnType<typeof createSupabaseAdminClient>, subscriptionId: string | null) { if (!subscriptionId) return null; const { data, error } = await supabase.from("subscriptions").select("id,user_id,status,plan_id,gateway_subscription_id,gateway_customer_id,current_period_end,plans(slug)").eq("gateway", "asaas").eq("gateway_subscription_id", subscriptionId).maybeSingle(); if (error) throw new Error(`Falha ao localizar assinatura Asaas: ${error.message}`); return data as SubscriptionRow | null; }
async function findFallbackSubscription(supabase: ReturnType<typeof createSupabaseAdminClient>, payload: AsaasWebhookPayload, checkoutUserId: string | null) { const userId = checkoutUserId ?? externalUserId(payload); const customerId = gatewayCustomerId(payload); let query = supabase.from("subscriptions").select("id,user_id,status,plan_id,gateway_subscription_id,gateway_customer_id,current_period_end,plans(slug)").eq("gateway", "asaas").order("updated_at", { ascending: false }).limit(1); if (userId) query = query.eq("user_id", userId); else if (customerId) query = query.eq("gateway_customer_id", customerId); else return null; const { data, error } = await query.maybeSingle(); if (error) throw new Error(`Falha ao localizar assinatura Asaas por fallback: ${error.message}`); return data as SubscriptionRow | null; }
async function dispatchCustomerEvents(input: { supabase: ReturnType<typeof createSupabaseAdminClient>; payload: AsaasWebhookPayload; subscription: SubscriptionRow; previousPlanSlug: string; nextPlanSlug: string; status: string; events: WebhookEvent[] }) { if (!input.events.length) return; const recipient = await resolveWebhookRecipientForUser(input.supabase, input.subscription.user_id, {}); const data = { userId: input.subscription.user_id, user_id: input.subscription.user_id, email: recipient.email, fullName: recipient.name, name: recipient.name, phone: recipient.phone, whatsapp: recipient.phone, planSlug: input.nextPlanSlug, plan_slug: input.nextPlanSlug, previousPlanSlug: input.previousPlanSlug, previous_plan_slug: input.previousPlanSlug, provider: "asaas", paymentId: asaasPaymentId(input.payload), payment_id: asaasPaymentId(input.payload), gateway_subscription_id: gatewaySubscriptionId(input.payload), localSubscriptionId: input.subscription.id, value: input.payload.payment?.value, status: input.status, asaas_event_id: asaasExternalEventId(input.payload), asaas_event_type: input.payload.event }; for (const event of Array.from(new Set(input.events))) await dispatchWebhookEvent({ event, source: "asaas", recipient, data }); }
function periodEndForPayment(payload: AsaasWebhookPayload) { const due = parseAsaasDate(payload.payment?.dueDate ?? payload.subscription?.nextDueDate ?? null); return due ? addMonths(due, 1) : null; }

export async function POST(req: Request) {
  let payload: AsaasWebhookPayload | null = null;
  const supabase = createSupabaseAdminClient();
  try {
    if (!validateWebhookToken(req)) return NextResponse.json({ error: "Token inválido." }, { status: 401 });
    const body = (await req.json()) as unknown;
    if (!isPayload(body)) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    payload = body;
    const event = payload.event!;
    const providerSubscriptionId = gatewaySubscriptionId(payload);
    if (await hasProcessedAsaasBillingEvent(supabase, payload)) return NextResponse.json({ received: true, duplicate: true });
    if (!HANDLED_EVENTS.has(event)) { await markEvent(supabase, payload, true, undefined, { ignored: true, reason: "unhandled_event" }); return NextResponse.json({ received: true, ignored: true }); }
    if (!payload.payment && !payload.subscription) { await markEvent(supabase, payload, false, "Payload sem payment ou subscription."); return NextResponse.json({ error: "Payload sem assinatura ou cobrança." }, { status: 400 }); }

    const checkout = await getCheckoutPlan(supabase, providerSubscriptionId);
    const exactSubscription = await findExactSubscription(supabase, providerSubscriptionId);
    if (event === "PAYMENT_DELETED") { await markEvent(supabase, payload, true, undefined, { ignored: true, reason: "payment_deleted_does_not_cancel_subscription", checkout_plan_slug: checkout?.planSlug ?? null }); return NextResponse.json({ received: true, synced: false, ignored: true, reason: "payment_deleted_does_not_cancel_subscription" }); }

    if (isSubscriptionCancellationEvent(event, payload)) {
      if (!exactSubscription?.id) { await markEvent(supabase, payload, true, undefined, { ignored: true, reason: "stale_subscription_cancellation_without_exact_local_match" }); return NextResponse.json({ received: true, synced: false, ignored: true, reason: "stale_subscription_cancellation_without_exact_local_match" }); }
      const previousPlanSlug = currentPlanSlug(exactSubscription);
      const now = new Date().toISOString();
      const { error } = await supabase.from("subscriptions").update({ status: "canceled", auto_renew: false, next_billing_at: null, canceled_at: now, last_webhook_event: event, updated_at: now }).eq("id", exactSubscription.id).eq("gateway", "asaas").eq("gateway_subscription_id", providerSubscriptionId);
      if (error) throw new Error(`Falha ao cancelar assinatura Asaas: ${error.message}`);
      const nextPlanSlug = "free";
      await dispatchCustomerEvents({ supabase, payload, subscription: exactSubscription, previousPlanSlug, nextPlanSlug, status: "canceled", events: ["subscription.canceled", getSpecificPlanTransitionEvent(previousPlanSlug, nextPlanSlug)].filter(Boolean) as WebhookEvent[] });
      await markEvent(supabase, payload, true, undefined, { synced_subscription_id: exactSubscription.id, status: "canceled" });
      return NextResponse.json({ received: true, synced: true, dispatched: ["subscription.canceled"] });
    }

    const fallbackSubscription = exactSubscription ?? await findFallbackSubscription(supabase, payload, checkout?.userId ?? null);
    if (!fallbackSubscription?.id) { await markEvent(supabase, payload, false, "Assinatura local Asaas não encontrada."); return NextResponse.json({ received: true, synced: false }); }
    const currentSlug = currentPlanSlug(fallbackSubscription);
    const checkoutPlanSlug = checkout?.planSlug ?? currentSlug;
    const shouldActivate = isConfirmedPaymentEvent(event, payload);
    const shouldMarkOverdue = isPaymentOverdueEvent(event, payload);
    const isExactMatch = Boolean(exactSubscription?.id);
    const isOlderLowerPlan = !isExactMatch && planRank(checkoutPlanSlug) < planRank(currentSlug);
    if (shouldActivate && isOlderLowerPlan) { await markEvent(supabase, payload, true, undefined, { ignored: true, reason: "older_lower_plan_activation_ignored", checkout_plan_slug: checkoutPlanSlug, current_plan_slug: currentSlug, current_subscription_id: fallbackSubscription.id }); return NextResponse.json({ received: true, synced: false, ignored: true, reason: "older_lower_plan_activation_ignored" }); }

    const now = new Date().toISOString();
    const plan = shouldActivate ? await getPlanBySlug(supabase, checkoutPlanSlug) : null;
    const periodEnd = shouldActivate ? periodEndForPayment(payload) : parseAsaasDate(payload.payment?.dueDate ?? payload.subscription?.nextDueDate ?? null);
    const nextPlanSlug = shouldActivate ? checkoutPlanSlug : currentSlug;
    const updatePayload: Record<string, unknown> = { gateway: "asaas", gateway_customer_id: gatewayCustomerId(payload) ?? fallbackSubscription.gateway_customer_id, last_webhook_event: event, updated_at: now };
    if (shouldActivate) { updatePayload.status = "active"; updatePayload.plan_id = plan?.id ?? fallbackSubscription.plan_id; updatePayload.current_period_end = periodEnd; updatePayload.next_billing_at = periodEnd; updatePayload.auto_renew = true; updatePayload.cancel_at_period_end = false; updatePayload.canceled_at = null; updatePayload.starts_at = now; if (providerSubscriptionId && (isExactMatch || planRank(checkoutPlanSlug) >= planRank(currentSlug))) updatePayload.gateway_subscription_id = providerSubscriptionId; }
    else if (shouldMarkOverdue) { updatePayload.status = "overdue"; updatePayload.current_period_end = periodEnd; updatePayload.next_billing_at = periodEnd; }
    else if (event === "PAYMENT_CREATED" || event === "SUBSCRIPTION_CREATED" || event === "SUBSCRIPTION_UPDATED") { if (providerSubscriptionId && isExactMatch) updatePayload.gateway_subscription_id = providerSubscriptionId; if (periodEnd) updatePayload.next_billing_at = periodEnd; }

    const { error } = await supabase.from("subscriptions").update(updatePayload).eq("id", fallbackSubscription.id).eq("gateway", "asaas");
    if (error) throw new Error(`Falha ao sincronizar assinatura Asaas: ${error.message}`);
    if (shouldActivate) { try { await ensureMinistryForSubscription({ userId: fallbackSubscription.user_id, planSlug: nextPlanSlug, subscriptionId: fallbackSubscription.id, status: "active", currentPeriodEnd: periodEnd ?? undefined }); } catch (ministryError) { console.error("[asaas.webhook] Falha ao sincronizar central ministerial", ministryError); } }
    const activationEvent = shouldActivate ? (getSpecificPlanTransitionEvent(checkout?.previousPlanSlug ?? currentSlug, nextPlanSlug) ?? getPlanActivatedEvent(nextPlanSlug)) : null;
    const failedEvent = shouldMarkOverdue ? "subscription.payment_failed" as WebhookEvent : null;
    const dispatchEvents = [activationEvent, failedEvent].filter(Boolean) as WebhookEvent[];
    await dispatchCustomerEvents({ supabase, payload, subscription: fallbackSubscription, previousPlanSlug: checkout?.previousPlanSlug ?? currentSlug, nextPlanSlug, status: shouldActivate ? "active" : shouldMarkOverdue ? "overdue" : normalizeLower(payload.payment?.status) ?? normalizeLower(payload.subscription?.status) ?? event, events: dispatchEvents });
    await markEvent(supabase, payload, true, undefined, { synced_subscription_id: fallbackSubscription.id, status: updatePayload.status ?? fallbackSubscription.status ?? null, checkout_plan_slug: checkoutPlanSlug });
    return NextResponse.json({ received: true, synced: true, dispatched: Array.from(new Set(dispatchEvents)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no webhook Asaas.";
    if (payload) { try { await markEvent(supabase, payload, false, message); } catch (auditError) { const auditMessage = auditError instanceof Error ? auditError.message : "Falha desconhecida ao auditar webhook."; console.error("[asaas.webhook.audit]", auditError); return NextResponse.json({ error: message, audit_error: auditMessage }, { status: 400 }); } }
    console.error("[asaas.webhook]", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
