import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { buildFakePayload, saveWebhookLog, signWebhookPayload } from "@/lib/webhooks/core";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/types/webhooks";

export async function POST(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const endpointId = String(body?.endpointId ?? "");
  const selectedEvent = String(body?.event ?? "") as WebhookEvent;
  const previewOnly = Boolean(body?.previewOnly);

  if (!WEBHOOK_EVENTS.includes(selectedEvent)) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: endpoint } = await admin.from("webhook_endpoints").select("id,url,secret,retry_enabled,retry_attempts").eq("id", endpointId).maybeSingle();
  if (!endpoint) return NextResponse.json({ error: "Endpoint não encontrado" }, { status: 404 });

  const payload = buildFakePayload(selectedEvent);
  const payloadString = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(payloadString, String(endpoint.secret), timestamp);
  const deliveryId = payload.id;


  if (previewOnly) {
    return NextResponse.json({ payload, delivery_id: deliveryId, signature, headers: {
      "X-Harmomus-Event": selectedEvent,
      "X-Harmomus-Signature": signature,
      "X-Harmomus-Delivery": deliveryId,
    } });
  }
  const attempts = endpoint.retry_enabled ? Array.from({ length: Math.max(1, Number(endpoint.retry_attempts ?? 1)) }, (_, i) => i) : [0];
  let lastResult: { ok: boolean; status: number; response: string; duration: number; error?: string } = { ok: false, status: 0, response: "", duration: 0 };

  for (const retryAttempt of attempts) {
    const start = Date.now();
    try {
      const response = await fetch(String(endpoint.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Harmomus-Event": selectedEvent,
          "X-Harmomus-Signature": signature,
          "X-Harmomus-Delivery": deliveryId,
          "X-Harmomus-Timestamp": String(timestamp),
        },
        body: payloadString,
      });
      const responseBody = await response.text();
      lastResult = { ok: response.ok, status: response.status, response: responseBody.slice(0, 5000), duration: Date.now() - start };
      await saveWebhookLog({ endpoint_id: endpoint.id, event: selectedEvent, delivery_id: deliveryId, status: response.status, success: response.ok, request_headers: {"X-Harmomus-Event":selectedEvent,"X-Harmomus-Delivery":deliveryId,"X-Harmomus-Timestamp":String(timestamp),"X-Harmomus-Signature":signature}, request_body: payload, response_body: lastResult.response, duration_ms: lastResult.duration, retry_attempt: retryAttempt, error_message: null });
      if (response.ok) break;
    } catch (error) {
      lastResult = { ok: false, status: 0, response: "", duration: Date.now() - start, error: error instanceof Error ? error.message : "Falha desconhecida" };
      await saveWebhookLog({ endpoint_id: endpoint.id, event: selectedEvent, delivery_id: deliveryId, status: 0, success: false, request_headers: {"X-Harmomus-Event":selectedEvent,"X-Harmomus-Delivery":deliveryId,"X-Harmomus-Timestamp":String(timestamp),"X-Harmomus-Signature":signature}, request_body: payload, response_body: null, duration_ms: lastResult.duration, retry_attempt: retryAttempt, error_message: lastResult.error });
    }
  }

  await admin.from("webhook_endpoints").update({ last_triggered_at: new Date().toISOString() }).eq("id", endpoint.id);
  return NextResponse.json({ ok: lastResult.ok, status: lastResult.status, response_body: lastResult.response, duration_ms: lastResult.duration, payload, delivery_id: deliveryId, signature });
}
