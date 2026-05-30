import { NextResponse } from "next/server";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { createClient } from "@/lib/supabase/server";

// Supabase pode enviar type=recovery para redefinição de senha e type=signup para confirmação de cadastro.
type OtpType = "signup" | "magiclink" | "recovery" | "invite" | "email" | "email_change";

function normalizeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/")) return "/";
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = normalizeOtpType(url.searchParams.get("type"));
  const next = normalizeNext(url.searchParams.get("next"));
  const supabase = await createClient();

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error("[auth-callback] code exchange failed", exchangeError);
      return NextResponse.redirect(new URL("/login?error=callback", request.url), 303);
    }
  } else if (tokenHash) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (verifyError) {
      console.error("[auth-callback] token hash verification failed", verifyError);
      return NextResponse.redirect(new URL("/login?error=callback", request.url), 303);
    }
  } else {
    return NextResponse.redirect(new URL("/login?error=callback", request.url), 303);
  }

  const { data: authUser } = await supabase.auth.getUser();
  const user = authUser.user;

  if (user?.id) {
    await ensureUserAccess({
      id: user.id,
      email: user.email,
      fullName: String(user.user_metadata?.full_name ?? "").trim() || user.email || "",
    });

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("onboarding_status")
      .eq("id", user.id)
      .maybeSingle();

    const onboardingStatus = String(profile?.onboarding_status ?? "");
    const now = new Date().toISOString();

    if (["pending_email_confirmation", "email_confirmed"].includes(onboardingStatus)) {
      await (supabase as any)
        .from("profiles")
        .update({
          onboarding_status: "onboarding_completed",
          onboarding_step: "completed",
          updated_at: now,
        })
        .eq("id", user.id);
    }
  }

  return NextResponse.redirect(new URL(next, request.url), 303);
}
