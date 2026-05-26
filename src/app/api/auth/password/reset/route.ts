import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const origin = new URL(request.url).origin;

  if (email && email.includes("@")) {
    const supabase = await createClient();
    const callbackUrl = new URL("/auth/callback", origin);
    callbackUrl.searchParams.set("next", "/redefinir-senha");

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl.toString(),
    });
  }

  return NextResponse.redirect(new URL("/recuperar-senha?success=1", request.url), 303);
}
