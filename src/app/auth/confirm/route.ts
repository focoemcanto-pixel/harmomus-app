import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = new Set<EmailOtpType>(["signup", "recovery", "magiclink", "email_change"]);

function normalizeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = normalizeNext(url.searchParams.get("next"));

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.redirect(new URL("/login?error=callback", request.url), 303);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
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
