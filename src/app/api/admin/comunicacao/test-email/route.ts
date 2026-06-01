import { NextResponse } from "next/server";

import {
  getActiveChannel,
  isMissingCommunicationTable,
  communicationTableErrorResponse,
  maskSecret,
  requireAdmin,
  sanitizeText,
  writeMarketingLog,
} from "../_lib/marketing-api";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const to = sanitizeText(body.to ?? body.email);
  const subject = sanitizeText(body.subject) || "Teste de e-mail Harmomus";
  const text = sanitizeText(body.text ?? body.message) || "Teste de e-mail da Central de Comunicação Harmomus.";
  const html = sanitizeText(body.html) || `<p>${text.replace(/\n/g, "<br />")}</p>`;

  if (!isEmail(to)) return NextResponse.json({ error: "Informe um e-mail de teste válido." }, { status: 400 });

  const { data: channel, error: channelError } = await getActiveChannel(admin, "email");
  if (channelError) {
    if (isMissingCommunicationTable(channelError)) return communicationTableErrorResponse();
    return NextResponse.json({ error: channelError.message }, { status: 500 });
  }
  if (!channel) return NextResponse.json({ error: "Canal de e-mail ativo não configurado." }, { status: 400 });

  const provider = sanitizeText(channel.provider).toLowerCase();
  const config = channel.config ?? {};
  const senderName = sanitizeText(config.senderName) || "Harmomus";
  const senderEmail = sanitizeText(config.senderEmail);
  const apiKey = sanitizeText(config.apiKey ?? config.smtpUser ?? config.smtpPass);

  const logPayload = { to, subject, html, text, provider, senderName, senderEmail, apiKey: maskSecret(apiKey) };

  if (provider === "smtp") {
    const message = "SMTP ainda não implementado";
    await writeMarketingLog({ admin, channel: "email", event: "communication.email.test", level: "warning", message, payload: logPayload, response: null });
    return NextResponse.json({ error: message }, { status: 501 });
  }

  if (provider !== "resend") {
    const message = `Provedor de e-mail ${provider || "desconhecido"} ainda não implementado.`;
    await writeMarketingLog({ admin, channel: "email", event: "communication.email.test", level: "warning", message, payload: logPayload, response: null });
    return NextResponse.json({ error: message }, { status: 501 });
  }

  if (!senderEmail) return NextResponse.json({ error: "E-mail remetente ausente." }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "API key do Resend ausente." }, { status: 400 });

  const resendPayload = {
    from: `${senderName} <${senderEmail}>`,
    to: [to],
    subject,
    html,
    text,
  };

  try {
    const providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(resendPayload),
    });
    const responseText = await providerResponse.text();
    let responseBody: unknown = responseText;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = responseText.slice(0, 1000);
    }

    const logResponse = { status: providerResponse.status, body: responseBody };
    if (!providerResponse.ok) {
      await writeMarketingLog({
        admin,
        channel: "email",
        event: "communication.email.test",
        level: "error",
        message: `Resend retornou HTTP ${providerResponse.status}.`,
        payload: logPayload,
        response: logResponse,
      });
      return NextResponse.json({ error: `Resend retornou HTTP ${providerResponse.status}.`, response: responseBody }, { status: 502 });
    }

    await writeMarketingLog({
      admin,
      channel: "email",
      event: "communication.email.test",
      level: "info",
      message: `Teste de e-mail enviado para ${to}.`,
      payload: logPayload,
      response: logResponse,
    });

    return NextResponse.json({ data: { ok: true, status: providerResponse.status, response: responseBody } });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao chamar Resend.";
    await writeMarketingLog({ admin, channel: "email", event: "communication.email.test", level: "error", message: errorMessage, payload: logPayload, response: { error: errorMessage } });
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}
