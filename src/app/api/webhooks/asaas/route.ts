import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const HANDLED_EVENTS = new Set([
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
  gateway_subscription_id?: string | null;
  gateway_customer_id?: string | null;
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

function paidPeriodEnd(dueDate?: string | null) {
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

function statusForEvent(event: string) {
  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") return "active";
  if (event === "PAYMENT_OVERDUE") return "overdue";
  if (event === "PAYMENT_DELETED" || event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED") return "canceled";
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
      .select("id,user_id,status,gateway_subscription_id,gateway_customer_id")
      .eq("gateway", "asaas")
      .eq("gateway_subscription_id", asaasSubscriptionId)
      .maybeSingle();
    if (error) throw new Error(`Falha ao localizar assinatura Asaas: ${error.message}`);
    if (data) return data as SubscriptionRow;
  }

  if (asaasCustomerId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,user_id,status,gateway_subscription_id,gateway_customer_id")
      .eq("gateway", "asaas")
      .eq("gateway_customer_id", asaasCustomerId)
      .maybeSingle();
    if (error) throw new Error(`Falha ao localizar customer Asaas: ${error.message}`);
    if (data) return data as SubscriptionRow;
  }

  if (userId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,user_id,status,gateway_subscription_id,gateway_customer_id")
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

function buildUpdatePayload(event: string, payload: AsaasWebhookPayload) {
  const status = statusForEvent(event);
  const paymentDueDate = payload.payment?.dueDate;
  const subscriptionDueDate = payload.subscription?.nextDueDate;
  const now = new Date().toISOString();
  const canceled = status === "canceled";
  const active = status === "active";

  return {
    gateway: "asaas",
    gateway_customer_id: gatewayCustomerId(payload),
    gateway_subscription_id: gatewaySubscriptionId(payload),
    status: status ?? undefined,
    current_period_end: active ? paidPeriodEnd(paymentDueDate) : parseAsaasDate(subscriptionDueDate ?? paymentDueDate),
    next_billing_at: parseAsaasDate(subscriptionDueDate ?? paymentDueDate),
    canceled_at: canceled ? now : undefined,
    auto_renew: canceled ? false : undefined,
    last_webhook_event: event,
    starts_at: active ? now : undefined,
    updated_at: now,
  };
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
    payload: payload as unknown as Record<string, unknown>,
    processed,
    processed_at: processed ? new Date().toISOString() : null,
    error_message: errorMessage ?? null,
  });

  if (error && error.code !== "23505") console.error("[asaas.webhook] Falha ao registrar billing_event", error);
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

    const updatePayload = buildUpdatePayload(event, payload);
    const sanitizedPayload = Object.fromEntries(Object.entries(updatePayload).filter(([, value]) => value !== undefined && value !== null));
    const { error } = await supabase.from("subscriptions").update(sanitizedPayload).eq("id", subscription.id).eq("gateway", "asaas");
    if (error) throw new Error(`Falha ao sincronizar assinatura Asaas: ${error.message}`);

    await markEvent(supabase, payload, true);
    return NextResponse.json({ received: true, synced: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no webhook Asaas.";
    if (payload) await markEvent(supabase, payload, false, message);
    console.error("[asaas.webhook]", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
