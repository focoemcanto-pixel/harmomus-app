import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCheckoutSession } from "@/lib/stripe/client";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function getEmailFromStripeSession(sessionId: string) {
  const session = await getCheckoutSession(sessionId);
  return normalizeEmail(session?.customer_details?.email ?? session?.customer_email);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const currentEmailFromBody = normalizeEmail(body?.email);
  const sessionId = String(body?.sessionId ?? "").trim();
  const newEmail = normalizeEmail(body?.newEmail);
  if (!newEmail || !newEmail.includes("@")) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const admin = createSupabaseAdminClient() as any;

  let targetUserId: string | null = auth.user?.id ?? null;
  let currentEmail = currentEmailFromBody;

  if (!targetUserId) {
    if (!currentEmail || !sessionId) {
      return NextResponse.json({ error: "Sessão de checkout e e-mail são obrigatórios para atualizar sem login." }, { status: 401 });
    }

    const stripeEmail = await getEmailFromStripeSession(sessionId).catch((error) => {
      console.error("[email-confirmation.update-email] sessão Stripe inválida", error);
      return "";
    });

    if (!stripeEmail) return NextResponse.json({ error: "Sessão de checkout inválida para alterar e-mail." }, { status: 403 });
    if (currentEmail !== stripeEmail) return NextResponse.json({ error: "E-mail não corresponde à sessão de checkout." }, { status: 403 });

    const { data: profileByEmail, error: profileByEmailError } = await admin
      .from("profiles")
      .select("id,email,onboarding_status")
      .ilike("email", currentEmail)
      .limit(1)
      .maybeSingle();

    if (profileByEmailError) return NextResponse.json({ error: profileByEmailError.message }, { status: 400 });
    if (!profileByEmail?.id) return NextResponse.json({ error: "Cadastro pendente não encontrado para este e-mail." }, { status: 404 });
    targetUserId = profileByEmail.id;
  } else if (!currentEmail) {
    currentEmail = normalizeEmail(auth.user?.email);
  }

  if (!targetUserId) return NextResponse.json({ error: "Usuário não localizado para atualizar e-mail." }, { status: 404 });

  const { data: currentProfile } = await admin.from("profiles").select("onboarding_status").eq("id", targetUserId).maybeSingle();
  if (String(currentProfile?.onboarding_status ?? "") !== "pending_email_confirmation") {
    return NextResponse.json({ error: "Ação disponível apenas na etapa de confirmação de e-mail." }, { status: 403 });
  }

  const authUpdate = await admin.auth.admin.updateUserById(targetUserId, { email: newEmail, email_confirm: false });
  if (authUpdate.error) return NextResponse.json({ error: authUpdate.error.message || "Falha ao atualizar usuário." }, { status: 400 });

  const { error: profileError } = await admin.from("profiles").update({ email: newEmail, onboarding_status: "pending_email_confirmation", onboarding_step: "waiting_email_confirmation", updated_at: new Date().toISOString() }).eq("id", targetUserId);
  if (profileError) return NextResponse.json({ error: profileError.message || "Falha ao atualizar perfil." }, { status: 400 });

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || null;
  const emailRedirectTo = base ? `${base}/auth/confirm?next=${encodeURIComponent("/login?confirmed=1")}` : undefined;
  const { error: resendError } = await supabase.auth.resend({ type: "signup", email: newEmail, options: emailRedirectTo ? { emailRedirectTo } : undefined });
  if (resendError) return NextResponse.json({ error: resendError.message || "Falha ao reenviar confirmação." }, { status: 400 });

  return NextResponse.json({ ok: true, email: newEmail });
}
