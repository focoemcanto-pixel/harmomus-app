import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function normalizeRedirect(raw: string) {
  if (!raw || !raw.startsWith("/")) return "/";
  return raw;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectPath = normalizeRedirect(String(formData.get("redirect") ?? ""));
  const supabase = await createClient();

  if (email && !password) {
    const { data: legacyMember } = await (supabase as any)
      .from("legacy_members")
      .select("email,legacy_plan_slug,legacy_status,migrated,password_created")
      .ilike("email", email)
      .maybeSingle();

    if (
      legacyMember &&
      String(legacyMember.legacy_plan_slug ?? "").toLowerCase() === "free" &&
      String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
      (!legacyMember.migrated || !legacyMember.password_created)
    ) {
      const url = new URL("/definir-senha-migrada", request.url);
      url.searchParams.set("email", email);
      return NextResponse.redirect(url, 303);
    }
  }

  const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "Credenciais inválidas. Tente novamente.");
    url.searchParams.set("redirect", redirectPath);
    return NextResponse.redirect(url, 303);
  }

  const user = data.user;

  if (user?.id) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

    if (String((profile as any)?.role ?? "").trim().toLowerCase() === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url), 303);
    }
  }

  return NextResponse.redirect(new URL(redirectPath || "/", request.url), 303);
}
