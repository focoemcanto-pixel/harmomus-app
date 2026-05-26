import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const origin = new URL(request.url).origin;

  if (email && email.includes("@")) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/redefinir-senha`,
    });
  }

  return NextResponse.redirect(new URL("/recuperar-senha?success=1", request.url), 303);
}
