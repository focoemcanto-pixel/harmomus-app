import { NextResponse } from "next/server";

import {
  getActiveChannel,
  isMissingCommunicationTable,
  marketingTableErrorResponse,
  maskSecret,
  requireAdmin,
  sanitizeText,
  writeMarketingLog,
} from "../_lib/marketing-api";

function normalizePhone(value: unknown) {
  return sanitizeText(value).replace(/\D/g, "");
}

function validDdiDddPhone(value: string) {
  return /^\d{12,15}$/.test(value);
}

function responseSnapshot(status: number, body: unknown) {
  return { status, body };
}

function isWasenderApi(apiUrl: string) {
  try {
    return new URL(apiUrl).hostname.replace(/^www\./, "") === "wasenderapi.com";
  } catch {
    return false;
  }
}

function buildProviderPayload({ apiUrl, phone, text, instance, createdAt }: { apiUrl: string; phone: string; text: string; instance: string; createdAt: string }) {
  if (isWasenderApi(apiUrl)) {
    return {
      to: phone,
      text,
    };
  }

  return {
    to: phone,
    phone,
    number: phone,
    whatsapp: phone,
    instance,
    text,
    message: text,
    mensagem: text,
    test: true,
    event: "communication.whatsapp.test",
    source: "harmomus.communication.settings",
    created_at: createdAt,
  };
}

export async function POST(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const phone = normalizePhone(body.phone ?? body.to ?? body.number ?? body.whatsapp);
  const text = sanitizeText(body.message ?? body.text ?? body.mensagem) || "Teste de WhatsApp Harmomus.";

  if (!validDdiDddPhone(phone)) {
    return NextResponse.json({ error: "Informe um WhatsApp com DDI + DDD + número." }, { status: 400 });
  }

  const { data: channel, error: channelError } = await getActiveChannel(admin, "whatsapp");
  if (channelError) {
    if (isMissingCommunicationTable(channelError)) return marketingTableErrorResponse();
    return NextResponse.json({ error: channelError.message }, { status: 500 });
  }
  if (!channel) return NextResponse.json({ error: "Canal WhatsApp ativo não configurado." }, { status: 400 });

  const config = channel.config ?? {};
  const apiUrl = sanitizeText(config.apiUrl);
  const apiToken = sanitizeText(config.apiToken);
  const instance = sanitizeText(config.instance);

  if (!apiUrl) return NextResponse.json({ error: "URL do provedor WhatsApp ausente." }, { status: 400 });
  if (isWasenderApi(apiUrl) && !apiToken) {
    return NextResponse.json({ error: "Token da Wasender ausente. Copie a API key da aba Credentials e salve nas configurações." }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  const payload = buildProviderPayload({ apiUrl, phone, text, instance, createdAt });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
    headers["X-Api-Key"] = apiToken;
  }

  try {
    const providerResponse = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const responseText = await providerResponse.text();
    let responseBody: unknown = responseText;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = responseText.slice(0, 1000);
    }

    const logPayload = { ...payload, apiUrl, apiToken: maskSecret(apiToken) };
    const logResponse = responseSnapshot(providerResponse.status, responseBody);

    if (!providerResponse.ok) {
      await writeMarketingLog({
        admin,
        channel: "whatsapp",
        event: "communication.whatsapp.test",
        level: "error",
        message: `Provedor WhatsApp retornou HTTP ${providerResponse.status}.`,
        payload: logPayload,
        response: logResponse,
      });
      return NextResponse.json({ error: `Provedor WhatsApp retornou HTTP ${providerResponse.status}.`, response: responseBody }, { status: 502 });
    }

    await writeMarketingLog({
      admin,
      channel: "whatsapp",
      event: "communication.whatsapp.test",
      level: "info",
      message: `Teste WhatsApp enviado para ${phone}.`,
      payload: logPayload,
      response: logResponse,
    });

    return NextResponse.json({ data: { ok: true, status: providerResponse.status, response: responseBody } });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao chamar provedor WhatsApp.";
    await writeMarketingLog({
      admin,
      channel: "whatsapp",
      event: "communication.whatsapp.test",
      level: "error",
      message: errorMessage,
      payload: { ...payload, apiUrl, apiToken: maskSecret(apiToken) },
      response: { error: errorMessage },
    });
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}
