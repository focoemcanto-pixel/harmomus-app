import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveWebhookLog, signWebhookPayload } from "@/lib/webhooks/core";
import { getWebhookEventLabel, WEBHOOK_EVENTS, type WebhookEvent } from "@/types/webhooks";

type DispatchWebhookInput = {
  event: WebhookEvent;
  data?: Record<string, unknown>;
  recipient?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  source?: string;
  mode?: "live" | "test";
};

const DEDUPED_SUBSCRIPTION_EVENTS = new Set<WebhookEvent>([
  "checkout.completed",
  "checkout.plus.completed",
  "checkout.premium.completed",
  "payment.approved",
  "plan.plus_activated",
  "plan.premium_activated",
  "plan.ministry_activated",
  "subscription.created",
  "subscription.renewed",
  "upgrade.free_to_plus",
  "upgrade.free_to_premium",
  "upgrade.plus_to_premium",
]);

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizePhone(value?: string | null) {
  if (!value) return "";
  return value.replace(/[\s()\-*]/g, "").replace(/\D/g, "");
}

function formatBrazilPhone(value?: string | null) {
  const digits = normalizePhone(value);
  if (!digits) return "";
  const withoutCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  const ddd = withoutCountry.slice(0, 2);
  const first = withoutCountry.length >= 11 ? withoutCountry.slice(2, 7) : withoutCountry.slice(2, 6);
  const last = withoutCountry.length >= 11 ? withoutCountry.slice(7, 11) : withoutCountry.slice(6, 10);

  if (!ddd || !first || !last) return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  return `+55 (${ddd}) ${first}-${last}`;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function dedupeValuesFromPayload(payload: Record<string, any>) {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  return [
    data.user_id,
    data.userId,
    data.stripe_subscription_id,
    data.gateway_subscription_id,
    data.localSubscriptionId,
    data.local_subscription_id,
    data.payment_id,
    data.paymentId,
    payload.email,
    payload.Email,
    payload.to,
    payload.phone,
    payload.whatsapp,
    payload.recipient?.email,
    payload.recipient?.phone,
    payload.customer?.email,
    payload.customer?.phone,
    payload.contact?.email,
    payload.contact?.phone,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function hasMatchingDedupeIdentity(currentPayload: Record<string, any>, previousPayload: Record<string, any>) {
  const currentValues = new Set(dedupeValuesFromPayload(currentPayload));
  if (!currentValues.size) return false;
  return dedupeValuesFromPayload(previousPayload).some((value) => currentValues.has(value));
}

async function hasRecentDuplicateDispatch(admin: any, input: { endpointId: string; event: WebhookEvent; payload: Record<string, unknown> }) {
  if (!DEDUPED_SUBSCRIPTION_EVENTS.has(input.event)) return false;

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from("webhook_logs")
    .select("id, request_body")
    .eq("endpoint_id", input.endpointId)
    .eq("event", input.event)
    .eq("success", true)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.warn("[webhooks] Falha ao verificar deduplicação de webhook", { event: input.event, endpointId: input.endpointId, error });
    return false;
  }

  return ((data ?? []) as Array<{ request_body?: Record<string, unknown> }>).some((row) =>
    hasMatchingDedupeIdentity(input.payload as Record<string, any>, (row.request_body ?? {}) as Record<string, any>),
  );
}

async function saveCommunicationLog(admin: any, input: {
  event: string;
  status: "success" | "failed";
  payload: Record<string, unknown>;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  try {
    await admin.from("communication_logs").insert({
      level: input.status === "success" ? "info" : "error",
      event: input.event,
      provider: "webhook_dispatcher",
      request: input.payload,
      response: input.responsePayload ?? null,
      message: input.errorMessage ?? (input.status === "success" ? "Webhook entregue com sucesso" : "Falha na entrega do webhook"),
    });
  } catch (error) {
    console.warn("[webhooks] Falha ao salvar communication_logs", error);
  }
}

function buildLivePayload(input: DispatchWebhookInput) {
  const phoneDigits = normalizePhone(input.recipient?.phone);
  const phoneDisplay = formatBrazilPhone(phoneDigits);
  const eventLabel = getWebhookEventLabel(input.event);
  const name = input.recipient?.name ?? "Cliente Harmomus";
  const email = input.recipient?.email ?? "";
  const message = `Evento Harmomus: ${eventLabel}`;

  return {
    event: input.event,
    event_label: eventLabel,
    test: input.mode === "test",
    mode: input.mode ?? "live",
    source: input.source ?? "harmomus",
    delivery_id: `evt_${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),

    phone: phoneDigits,
    number: phoneDigits,
    to: phoneDigits,
    whatsapp: phoneDigits,
    recipient_phone: phoneDigits,
    contact_phone: phoneDigits,

    Nome: name,
    nome: name,
    Email: email,
    email,
    Telefone: phoneDisplay,
    telefone: phoneDisplay,
    Celular: phoneDisplay,
    celular: phoneDisplay,
    WhatsApp: phoneDisplay,

    message,
    text: message,
    Mensagem: message,
    mensagem: message,

    recipient: {
      name,
      email,
      phone: phoneDigits,
      whatsapp: phoneDigits,
      telefone: phoneDisplay,
      Telefone: phoneDisplay,
    },
    customer: {
      name,
      email,
      phone: phoneDigits,
      whatsapp: phoneDigits,
      telefone: phoneDisplay,
      Telefone: phoneDisplay,
    },
    contact: {
      name,
      email,
      phone: phoneDigits,
      number: phoneDigits,
      whatsapp: phoneDigits,
      telefone: phoneDisplay,
      Telefone: phoneDisplay,
    },
    contato: {
      nome: name,
      email,
      telefone: phoneDisplay,
      celular: phoneDisplay,
      whatsapp: phoneDisplay,
    },
    data: input.data ?? {},
  };
}

async function dispatchWebhookEventUnsafe(input: DispatchWebhookInput) {
  if (input.event === "upgrade.free_to_premium") {
    return { dispatched: 0, skipped: true, reason: "free_to_premium_uses_plan_premium_activated" };
  }

  if (!WEBHOOK_EVENTS.includes(input.event)) {
    return { dispatched: 0, skipped: true, reason: "unsupported_event" };
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: endpoints, error } = await admin
    .from("webhook_endpoints")
    .select("id,url,secret,retry_enabled,retry_attempts,events,active")
    .eq("active", true);

  if (error || !endpoints?.length) {
    if (error) console.warn("[webhooks] Falha ao buscar endpoints", { event: input.event, error });
    return { dispatched: 0, error: error?.message ?? null };
  }

  const matchedEndpoints = endpoints.filter((endpoint: any) =>
    Array.isArray(endpoint.events) && endpoint.events.includes(input.event),
  );

  if (!matchedEndpoints.length) return { dispatched: 0 };

  let dispatched = 0;
  let skippedDuplicate = 0;

  for (const endpoint of matchedEndpoints) {
    const payload = buildLivePayload(input);
    const missingPaidPhoneDiagnostic = !normalizePhone(input.recipient?.phone) && /^(plan\.|upgrade\.|downgrade\.|subscription\.(canceled|payment_failed))/.test(input.event)
      ? "missing_phone_for_paid_webhook"
      : null;
    if (missingPaidPhoneDiagnostic) {
      (payload.data as Record<string, unknown>).diagnostic = (payload.data as Record<string, unknown>).diagnostic ?? missingPaidPhoneDiagnostic;
      (payload as Record<string, unknown>).diagnostic = missingPaidPhoneDiagnostic;
    }

    if (await hasRecentDuplicateDispatch(admin, { endpointId: endpoint.id, event: input.event, payload })) {
      console.info("[webhooks] Disparo duplicado ignorado", { event: input.event, endpointId: endpoint.id, email: payload.email, phone: payload.to, data: payload.data });
      skippedDuplicate += 1;
      continue;
    }

    const payloadString = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(payloadString, String(endpoint.secret), timestamp);
    const deliveryId = String(payload.delivery_id);
    const attempts = endpoint.retry_enabled
      ? Array.from({ length: Math.max(1, Number(endpoint.retry_attempts ?? 1)) }, (_, i) => i)
      : [0];

    for (const retryAttempt of attempts) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(String(endpoint.url), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Harmomus-Event": input.event,
            "X-Harmomus-Signature": signature,
            "X-Harmomus-Delivery": deliveryId,
            "X-Harmomus-Timestamp": String(timestamp),
          },
          body: payloadString,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        const responseBody = await response.text();
        await saveWebhookLog({
          endpoint_id: endpoint.id,
          event: input.event,
          delivery_id: deliveryId,
          status: response.status,
          success: response.ok,
          request_headers: {
            "X-Harmomus-Event": input.event,
            "X-Harmomus-Delivery": deliveryId,
            "X-Harmomus-Timestamp": String(timestamp),
            "X-Harmomus-Signature": signature,
          },
          request_body: payload,
          response_body: responseBody.slice(0, 5000),
          duration_ms: Date.now() - start,
          retry_attempt: retryAttempt,
          error_message: response.ok ? missingPaidPhoneDiagnostic : `Webhook retornou status ${response.status}${missingPaidPhoneDiagnostic ? `; ${missingPaidPhoneDiagnostic}` : ""}`,
        });

        await saveCommunicationLog(admin, {
          event: input.event,
          status: response.ok ? "success" : "failed",
          payload,
          responsePayload: { status: response.status, body: responseBody.slice(0, 1000), endpoint_id: endpoint.id },
          errorMessage: response.ok ? missingPaidPhoneDiagnostic : `Webhook retornou status ${response.status}${missingPaidPhoneDiagnostic ? `; ${missingPaidPhoneDiagnostic}` : ""}`,
        });

        if (response.ok) break;
      } catch (error) {
        console.error("[webhooks] Erro no disparo de webhook", { event: input.event, endpointId: endpoint.id, retryAttempt, error });
        await saveWebhookLog({
          endpoint_id: endpoint.id,
          event: input.event,
          delivery_id: deliveryId,
          status: 0,
          success: false,
          request_headers: {
            "X-Harmomus-Event": input.event,
            "X-Harmomus-Delivery": deliveryId,
            "X-Harmomus-Timestamp": String(timestamp),
            "X-Harmomus-Signature": signature,
          },
          request_body: payload,
          response_body: null,
          duration_ms: Date.now() - start,
          retry_attempt: retryAttempt,
          error_message: `${error instanceof Error ? error.message : "Falha desconhecida"}${missingPaidPhoneDiagnostic ? `; ${missingPaidPhoneDiagnostic}` : ""}`,
        });

        await saveCommunicationLog(admin, {
          event: input.event,
          status: "failed",
          payload,
          responsePayload: null,
          errorMessage: `${error instanceof Error ? error.message : "Falha desconhecida"}${missingPaidPhoneDiagnostic ? `; ${missingPaidPhoneDiagnostic}` : ""}`,
        });
      }
    }

    await admin.from("webhook_endpoints").update({ last_triggered_at: new Date().toISOString() }).eq("id", endpoint.id);
    dispatched += 1;
  }

  return { dispatched, skippedDuplicate };
}

export async function dispatchWebhookEvent(input: DispatchWebhookInput) {
  try {
    return await dispatchWebhookEventUnsafe(input);
  } catch (error) {
    console.error("[webhooks] Dispatcher falhou sem interromper o fluxo principal", { event: input.event, error });
    return { dispatched: 0, error: error instanceof Error ? error.message : "unknown" };
  }
}
