import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const origin = new URL(request.url).origin;

  if (email && email.includes("@")) {
    const supabase = await createClient();
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("migrated_from_pms, requires_password_setup")
      .eq("email", email)
      .maybeSingle();

    if (profile?.migrated_from_pms && profile.requires_password_setup) {
      const callbackUrl = new URL("/auth/confirm", origin);
      callbackUrl.searchParams.set("next", "/redefinir-senha?migration=1");
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });
    }
  }

  const url = new URL("/definir-senha-migrada", request.url);
  url.searchParams.set("email", email);
  url.searchParams.set("success", "1");
  return NextResponse.redirect(url, 303);
}
