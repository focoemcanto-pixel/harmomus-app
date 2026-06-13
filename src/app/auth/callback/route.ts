import { NextResponse } from "next/server";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { syncProfileOnboardingAfterAuth } from "@/lib/auth/onboarding";
import { createClient } from "@/lib/supabase/server";

// Supabase pode enviar type=recovery para redefinição de senha e type=signup para confirmação de cadastro.
type OtpType = "signup" | "magiclink" | "recovery" | "invite" | "email" | "email_change";

function normalizeNext(raw: string | null, type: OtpType) {
  if (type === "recovery") return "/redefinir-senha";
  if (!raw || !raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (/^\/https?:/i.test(raw)) return "/";
  return raw;
}

function normalizeOtpType(raw: string | null): OtpType {
  if (raw === "recovery") return "recovery";
  if (raw === "invite") return "invite";
  if (raw === "magiclink") return "magiclink";
  if (raw === "email_change") return "email_change";
  if (raw === "email") return "email";
  return "signup";
}

function getStringMetadata(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function resolveAuthPhone(user: any) {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return (
    getStringMetadata(metadata, ["phone", "whatsapp", "mobile", "phone_number", "billing_phone"]) ||
    (typeof user?.phone === "string" && user.phone.trim() ? user.phone.trim() : null)
  );
}

function callbackErrorUrl(request: Request, type: OtpType, reason = "callback") {
  if (type === "recovery") {
    const url = new URL("/redefinir-senha", request.url);
    url.searchParams.set("error", reason === "expired" ? "Link expirado. Solicite uma nova redefinição de senha." : "Não foi possível validar o link. Solicite uma nova redefinição de senha.");
    return url;
  }
  return new URL(`/login?error=${encodeURIComponent(reason)}`, request.url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = normalizeOtpType(url.searchParams.get("type"));
  const next = normalizeNext(url.searchParams.get("next"), type);
  const supabase = await createClient();

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error("[auth-callback] code exchange failed", exchangeError);
      const expired = String(exchangeError.message ?? "").toLowerCase().includes("expired");
      return NextResponse.redirect(callbackErrorUrl(request, type, expired ? "expired" : "callback"), 303);
    }
  } else if (tokenHash) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (verifyError) {
      console.error("[auth-callback] token hash verification failed", verifyError);
      const expired = String(verifyError.message ?? "").toLowerCase().includes("expired");
      return NextResponse.redirect(callbackErrorUrl(request, type, expired ? "expired" : "callback"), 303);
    }
  } else {
    return NextResponse.redirect(callbackErrorUrl(request, type), 303);
  }

  const { data: authUser } = await supabase.auth.getUser();
  const user = authUser.user;

  if (user?.id && type !== "recovery") {
    await ensureUserAccess({
      id: user.id,
      email: user.email,
      fullName: String(user.user_metadata?.full_name ?? "").trim() || user.email || "",
      phone: resolveAuthPhone(user),
    });

    await syncProfileOnboardingAfterAuth({ userId: user.id, authUser: user as any });
  }

  return NextResponse.redirect(new URL(next, request.url), 303);
}
