import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";

function maskSecret(value?: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function GET() {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id || !context.ministry || !isMinistryManager(context)) {
    return NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY),
    resendApiKeyPreview: maskSecret(process.env.RESEND_API_KEY),
    hasResendFromEmail: Boolean(process.env.RESEND_FROM_EMAIL),
    resendFromEmail: process.env.RESEND_FROM_EMAIL ?? null,
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    nextPublicSiteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    appBaseUrl: process.env.APP_BASE_URL ?? null,
    cfPagesUrl: process.env.CF_PAGES_URL ?? null,
  });
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id || !context.ministry || !isMinistryManager(context)) {
    return NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return NextResponse.json({
      ok: false,
      error: "missing_env",
      hasResendApiKey: Boolean(apiKey),
      hasResendFromEmail: Boolean(from),
    }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const to = String(body?.to ?? context.profile?.email ?? "").trim().toLowerCase();

  if (!to || !to.includes("@")) {
    return NextResponse.json({ ok: false, error: "invalid_to" }, { status: 400 });
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
  let parsed: any = null;

  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    resendResponse: parsed ?? raw,
  }, { status: response.ok ? 200 : 502 });
}
