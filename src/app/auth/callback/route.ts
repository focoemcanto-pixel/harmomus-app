import { NextResponse } from "next/server";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { createClient } from "@/lib/supabase/server";

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
  }

  return NextResponse.redirect(new URL(next, request.url), 303);
}
