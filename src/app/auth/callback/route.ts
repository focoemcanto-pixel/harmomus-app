import { NextResponse } from "next/server";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { createClient } from "@/lib/supabase/server";

function normalizeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = normalizeNext(url.searchParams.get("next"));

  if (!code) return NextResponse.redirect(new URL("/login?error=callback", request.url), 303);

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return NextResponse.redirect(new URL("/login?error=callback", request.url), 303);

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
