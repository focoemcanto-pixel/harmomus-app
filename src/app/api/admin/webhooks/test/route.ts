import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { buildFakePayload, normalizeTestPhone, saveWebhookLog, signWebhookPayload } from "@/lib/webhooks/core";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/types/webhooks";

function headersToRecord(headers: Headers) {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function isProbablyLabMessageReceipt(responseBody: string, responseHeaders: Record<string, string>) {
  const body = responseBody.trim().toLowerCase();
  const contentType = responseHeaders["content-type"]?.toLowerCase() ?? "";

  // Status HTTP 2xx confirma apenas que algum servidor respondeu.
  // Para LabMessage, consideramos "confirmado" somente quando a resposta parece ser JSON/API,
  // não uma página HTML, redirecionamento mascarado ou corpo vazio genérico.
  if (contentType.includes("application/json")) return true;
  if (body.includes("labmessage")) return true;
  if (body.includes("webhook") && (body.includes("received") || body.includes("success") || body.includes("ok"))) return true;
  return false;
}

export async function POST(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const endpointId = String(body?.endpoint_id ?? body?.endpointId ?? "");
  const selectedEvent = String(body?.event ?? "") as WebhookEvent;
  const rawTestPhone = String(body?.test_phone ?? "");
  const previewOnly = Boolean(body?.previewOnly);

  if (!WEBHOOK_EVENTS.includes(selectedEvent)) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  const testPhone = normalizeTestPhone(rawTestPhone);
  if (!testPhone) return NextResponse.json({ error: "Informe um número de teste para validar este webhook." }, { status: 400 });
  if (testPhone.length < 12 || testPhone.length > 13) return NextResponse.json({ error: "Número de teste inválido. Use DDI + DDD + número, apenas dígitos." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: endpoint } = await admin.from("webhook_endpoints").select("id,url,secret,retry_enabled,retry_attempts,events,active").eq("id", endpointId).maybeSingle();
  if (!endpoint) return NextResponse.json({ error: "Endpoint não encontrado" }, { status: 404 });
  if (!endpoint.active) return NextResponse.json({ error: "Endpoint inativo." }, { status: 400 });
  if (!Array.isArray(endpoint.events) || !endpoint.events.includes(selectedEvent)) {
    return NextResponse.json({ error: "Evento não permitido para este webhook." }, { status: 400 });
  }

  const endpointUrl = String(endpoint.url ?? "").trim();
  try {
    const parsedUrl = new URL(endpointUrl);
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json({ error: "Use uma URL HTTPS válida para o webhook." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "URL do webhook inválida." }, { status: 400 });
  }

  const payload = buildFakePayload(selectedEvent, testPhone);
  const payloadString = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(payloadString, String(endpoint.secret), timestamp);
  const deliveryId = payload.delivery_id;
  const requestHeaders = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "User-Agent": "Harmomus-Webhook-Test/1.0",
    "X-Harmomus-Event": selectedEvent,
    "X-Harmomus-Signature": signature,
    "X-Harmomus-Delivery": deliveryId,
    "X-Harmomus-Timestamp": String(timestamp),
  };

  if (previewOnly) {
    return NextResponse.json({ payload, delivery_id: deliveryId, signature, headers: requestHeaders, normalized_phone: testPhone });
  }

  const attempts = endpoint.retry_enabled ? Array.from({ length: Math.max(1, Number(endpoint.retry_attempts ?? 1)) }, (_, i) => i) : [0];
  let lastResult: {
    ok: boolean;
    accepted: boolean;
    confirmed: boolean;
    status: number;
    response: string;
    duration: number;
    error?: string;
    response_url?: string;
    response_headers?: Record<string, string>;
  } = { ok: false, accepted: false, confirmed: false, status: 0, response: "", duration: 0 };

  for (const retryAttempt of attempts) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: requestHeaders,
        body: payloadString,
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const responseBody = await response.text();
      const responseHeaders = headersToRecord(response.headers);
      const confirmed = response.ok && isProbablyLabMessageReceipt(responseBody, responseHeaders);

      lastResult = {
        ok: confirmed,
        accepted: response.ok,
        confirmed,
        status: response.status,
        response: responseBody.slice(0, 5000),
        duration: Date.now() - start,
        response_url: response.url,
        response_headers: responseHeaders,
      };

      await saveWebhookLog({
        endpoint_id: endpoint.id,
        event: selectedEvent,
        delivery_id: deliveryId,
        status: response.status,
        success: confirmed,
        request_headers: requestHeaders,
        request_body: payload,
        response_body: lastResult.response,
        duration_ms: lastResult.duration,
        retry_attempt: retryAttempt,
        error_message: confirmed ? null : response.ok ? "Destino respondeu HTTP 2xx, mas não confirmou recebimento como API/LabMessage." : null,
      });

      if (confirmed) break;
      if (response.ok) break;
    } catch (error) {
      lastResult = { ok: false, accepted: false, confirmed: false, status: 0, response: "", duration: Date.now() - start, error: error instanceof Error ? error.message : "Falha desconhecida" };
      await saveWebhookLog({
        endpoint_id: endpoint.id,
        event: selectedEvent,
        delivery_id: deliveryId,
        status: 0,
        success: false,
        request_headers: requestHeaders,
        request_body: payload,
        response_body: null,
        duration_ms: lastResult.duration,
        retry_attempt: retryAttempt,
        error_message: lastResult.error,
      });
    }
  }

  await admin.from("webhook_endpoints").update({ last_triggered_at: new Date().toISOString() }).eq("id", endpoint.id);
  return NextResponse.json({
    ok: lastResult.ok,
    accepted: lastResult.accepted,
    confirmed: lastResult.confirmed,
    status: lastResult.status,
    response_body: lastResult.response,
    response_headers: lastResult.response_headers,
    response_url: lastResult.response_url,
    duration_ms: lastResult.duration,
    payload,
    normalized_phone: testPhone,
    delivery_id: deliveryId,
    signature,
    diagnostic: lastResult.confirmed
      ? "Resposta parece confirmada pelo destino."
      : lastResult.accepted
        ? "O servidor respondeu 2xx, mas não houve confirmação clara de recebimento pelo LabMessage. Verifique response_url, response_headers e response_body."
        : "Falha de entrega HTTP.",
  });
}
