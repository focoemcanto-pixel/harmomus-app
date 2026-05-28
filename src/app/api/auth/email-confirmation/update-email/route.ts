import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const newEmail = String(body?.newEmail ?? "").trim().toLowerCase();
  if (!newEmail || !newEmail.includes("@")) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });

  const admin = createSupabaseAdminClient() as any;
  const { data: currentProfile } = await admin.from("profiles").select("onboarding_status").eq("id", auth.user.id).maybeSingle();
  if (String(currentProfile?.onboarding_status ?? "") !== "pending_email_confirmation") {
    return NextResponse.json({ error: "Ação disponível apenas na etapa de confirmação de e-mail." }, { status: 403 });
  }

  const authUpdate = await admin.auth.admin.updateUserById(auth.user.id, { email: newEmail, email_confirm: false });
  if (authUpdate.error) return NextResponse.json({ error: authUpdate.error.message || "Falha ao atualizar usuário." }, { status: 400 });

  const { error: profileError } = await admin.from("profiles").update({ email: newEmail, onboarding_status: "pending_email_confirmation", onboarding_step: "waiting_email_confirmation", updated_at: new Date().toISOString() }).eq("id", auth.user.id);
  if (profileError) return NextResponse.json({ error: profileError.message || "Falha ao atualizar perfil." }, { status: 400 });

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || null;
  const emailRedirectTo = base ? `${base}/auth/confirm?next=${encodeURIComponent("/login?confirmed=1")}` : undefined;
  const { error: resendError } = await supabase.auth.resend({ type: "signup", email: newEmail, options: emailRedirectTo ? { emailRedirectTo } : undefined });
  if (resendError) return NextResponse.json({ error: resendError.message || "Falha ao reenviar confirmação." }, { status: 400 });

  return NextResponse.json({ ok: true, email: newEmail });
}
