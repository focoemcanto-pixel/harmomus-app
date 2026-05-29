import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function appBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || new URL(request.url).origin;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: userError } = await supabase.auth.getUser();
  const email = auth.user?.email?.trim().toLowerCase();

  if (userError || !email) {
    return NextResponse.json({ error: "Você precisa estar logado para alterar a senha." }, { status: 401 });
  }

  const callbackUrl = new URL("/auth/confirm/callback", appBaseUrl(request));
  callbackUrl.searchParams.set("type", "recovery");
  callbackUrl.searchParams.set("next", "/redefinir-senha");

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });

  if (error) {
    return NextResponse.json({ error: error.message || "Não foi possível enviar o e-mail de alteração de senha." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, email });
}
