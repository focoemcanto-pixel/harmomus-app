import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });

  const admin = createSupabaseAdminClient() as any;
  const { data: profile } = await admin.from("profiles").select("email,onboarding_status").eq("id", auth.user.id).maybeSingle();
  if (String(profile?.onboarding_status ?? "") !== "pending_email_confirmation") {
    return NextResponse.json({ error: "Ação disponível apenas na etapa de confirmação de e-mail." }, { status: 403 });
  }

  const email = String(profile?.email ?? auth.user.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "E-mail não encontrado." }, { status: 400 });

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || null;
  const emailRedirectTo = base ? `${base}/auth/confirm?next=${encodeURIComponent("/login?confirmed=1")}` : undefined;

  const { error } = await supabase.auth.resend({ type: "signup", email, options: emailRedirectTo ? { emailRedirectTo } : undefined });
  if (error) return NextResponse.json({ error: error.message || "Falha ao reenviar e-mail." }, { status: 400 });

  return NextResponse.json({ ok: true, email });
}
