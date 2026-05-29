import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_VERSION = "2026-05-29-debug-me-resend-v1";

function maskSecret(value?: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function runResendTest(to: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "missing_env",
      hasResendApiKey: Boolean(apiKey),
      hasResendFromEmail: Boolean(from),
    };
  }

  if (!to || !to.includes("@")) {
    return { ok: false, error: "invalid_to" };
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
          <p>Se você recebeu este e-mail, a rota /api/debug/me está conseguindo chamar o Resend corretamente.</p>
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

  return {
    ok: response.ok,
    status: response.status,
    resendResponse: parsed ?? raw,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const context = await getCurrentUserAccessContext();
  const url = new URL(request.url);
  const shouldTestResend = url.searchParams.get("resendTest") === "1";
  const resendTo = url.searchParams.get("to") || data.user?.email || "";
  const resendTest = shouldTestResend && data.user ? await runResendTest(resendTo) : null;

  return NextResponse.json({
    debugVersion: DEBUG_VERSION,
    buildMarker: "FORCE_DEPLOY_TEST_20260529",
    authError: error?.message ?? null,
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email,
        }
      : null,
    profile: context.profile
      ? {
          id: context.profile.id,
          email: context.profile.email,
          role: context.profile.role,
        }
      : null,
    isGuest: context.isGuest,
    isAdmin: context.isAdmin,
    effectiveSlug: context.effectiveSlug,
    resend: {
      hasResendApiKey: Boolean(process.env.RESEND_API_KEY),
      resendApiKeyPreview: maskSecret(process.env.RESEND_API_KEY),
      hasResendFromEmail: Boolean(process.env.RESEND_FROM_EMAIL),
      resendFromEmail: process.env.RESEND_FROM_EMAIL ?? null,
      testRan: shouldTestResend,
      testTo: shouldTestResend ? resendTo : null,
      testResult: resendTest,
    },
  });
}
