import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function appBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || new URL(request.url).origin;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email && email.includes("@")) {
    const supabase = await createClient();
    const callbackUrl = new URL("/auth/callback", appBaseUrl(request));
    callbackUrl.searchParams.set("type", "recovery");
    callbackUrl.searchParams.set("next", "/redefinir-senha");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl.toString(),
    });

    if (error) console.error("[auth.password.reset] resetPasswordForEmail failed", { email, error });
  }

  return NextResponse.redirect(new URL("/recuperar-senha?success=1", request.url), 303);
}
