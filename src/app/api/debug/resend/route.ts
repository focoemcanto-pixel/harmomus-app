import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DIAGNOSTICS_VERSION = "2026-05-29-debug-resend-v1";

function maskSecret(value?: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function json(data: Record<string, unknown>, init?: ResponseInit) {
  const response = NextResponse.json({ diagnosticsVersion: DIAGNOSTICS_VERSION, ...data }, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("X-Harmomus-Diagnostics", DIAGNOSTICS_VERSION);
  return response;
}

export async function GET() {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id) {
    return json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  return json({
    ok: true,
    user: {
      id: context.profile.id,
      email: context.profile.email,
      role: context.profile.role,
    },
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY),
    resendApiKeyPreview: maskSecret(process.env.RESEND_API_KEY),
    hasResendFromEmail: Boolean(process.env.RESEND_FROM_EMAIL),
    resendFromEmail: process.env.RESEND_FROM_EMAIL ?? null,
  });
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id) {
    return json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return json({
      ok: false,
      error: "missing_env",
      hasResendApiKey: Boolean(apiKey),
      hasResendFromEmail: Boolean(from),
    }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const to = String(body?.to ?? context.profile?.email ?? "").trim().toLowerCase();

  if (!to || !to.includes("@")) {
    return json({ ok: false, error: "invalid_to" }, { status: 400 });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Teste de envio Harmomus",
      html: `
        <div style="font-family:Arial,sans-serif;padding:24px">
          <h1>Teste de envio Harmomus</h1>
          <p>Se você recebeu este e-mail, o Worker está conseguindo chamar o Resend corretamente.</p>
        </div>
      `,
    }),
  });

  const raw = await response.text().catch(() => "");
  let parsed: unknown = null;

  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  return json({
    ok: response.ok,
    status: response.status,
    resendResponse: parsed ?? raw,
  }, { status: response.ok ? 200 : 502 });
}
