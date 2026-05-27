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


async function saveCommunicationLog(admin: any, input: {
  event: string;
  status: "success" | "failed";
  payload: Record<string, unknown>;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  try {
    await admin.from("communication_logs" as never).insert({
      channel: "webhook",
      provider: "webhook_dispatcher",
      status: input.status,
      payload: { event: input.event, ...input.payload },
      response_payload: input.responsePayload ?? null,
      error_message: input.errorMessage ?? null,
    } as never);
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

export async function dispatchWebhookEvent(input: DispatchWebhookInput) {
  if (!WEBHOOK_EVENTS.includes(input.event)) {
    return { dispatched: 0, skipped: true, reason: "unsupported_event" };
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: endpoints, error } = await admin
    .from("webhook_endpoints")
    .select("id,url,secret,retry_enabled,retry_attempts,events,active")
    .eq("active", true);

  if (error || !endpoints?.length) {
    return { dispatched: 0, error: error?.message ?? null };
  }

  const matchedEndpoints = endpoints.filter((endpoint: any) =>
    Array.isArray(endpoint.events) && endpoint.events.includes(input.event),
  );

  if (!matchedEndpoints.length) return { dispatched: 0 };

  let dispatched = 0;

  for (const endpoint of matchedEndpoints) {
    const payload = buildLivePayload(input);
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
        });

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
          error_message: null,
        });

        await saveCommunicationLog(admin, {
          event: input.event,
          status: response.ok ? "success" : "failed",
          payload,
          responsePayload: { status: response.status, body: responseBody.slice(0, 1000), endpoint_id: endpoint.id },
          errorMessage: response.ok ? null : `Webhook retornou status ${response.status}`,
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
          error_message: error instanceof Error ? error.message : "Falha desconhecida",
        });

        await saveCommunicationLog(admin, {
          event: input.event,
          status: "failed",
          payload,
          responsePayload: null,
          errorMessage: error instanceof Error ? error.message : "Falha desconhecida",
        });
      }
    }

    await admin.from("webhook_endpoints").update({ last_triggered_at: new Date().toISOString() }).eq("id", endpoint.id);
    dispatched += 1;
  }

  return { dispatched };
}
