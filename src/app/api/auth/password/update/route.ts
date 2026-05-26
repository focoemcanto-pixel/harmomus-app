import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (password.length < 6) return NextResponse.redirect(new URL("/redefinir-senha?error=A+senha+deve+ter+pelo+menos+6+caracteres.", request.url), 303);
  if (password !== confirmPassword) return NextResponse.redirect(new URL("/redefinir-senha?error=As+senhas+n%C3%A3o+conferem.", request.url), 303);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return NextResponse.redirect(new URL("/redefinir-senha?error=N%C3%A3o+foi+poss%C3%ADvel+redefinir+a+senha.", request.url), 303);

  return NextResponse.redirect(new URL("/login?reset=success", request.url), 303);
}
