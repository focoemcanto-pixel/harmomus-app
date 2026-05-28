import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCheckoutSession } from "@/lib/stripe/client";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function appBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || new URL(request.url).origin;
}

async function getEmailFromStripeSession(sessionId: string) {
  const session = await getCheckoutSession(sessionId);
  const email = normalizeEmail(session?.customer_details?.email ?? session?.customer_email);
  if (!email) return null;
  return email;
}

async function findPendingProfileByEmail(admin: any, email: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,onboarding_status")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const requestedEmail = normalizeEmail(body?.email);
  const sessionId = String(body?.sessionId ?? "").trim();

  const admin = createSupabaseAdminClient() as any;
  const supabase = await createClient();

  let email = requestedEmail;

  if (sessionId) {
    const stripeEmail = await getEmailFromStripeSession(sessionId).catch((error) => {
      console.error("[email-confirmation.resend] sessão Stripe inválida", error);
      return null;
    });

    if (!stripeEmail) return NextResponse.json({ error: "Sessão de checkout inválida para reenviar confirmação." }, { status: 403 });
    if (email && email !== stripeEmail) return NextResponse.json({ error: "E-mail não corresponde à sessão de checkout." }, { status: 403 });
    email = stripeEmail;
  }

  if (!email) {
    const { data: auth } = await supabase.auth.getUser();
    email = normalizeEmail(auth.user?.email);
  }

  if (!email) return NextResponse.json({ error: "E-mail não encontrado para reenviar confirmação." }, { status: 400 });

  const profile = await findPendingProfileByEmail(admin, email);
  if (!profile?.id) return NextResponse.json({ error: "Cadastro pendente não encontrado para este e-mail." }, { status: 404 });

  if (String(profile.onboarding_status ?? "") !== "pending_email_confirmation") {
    return NextResponse.json({ error: "Ação disponível apenas na etapa de confirmação de e-mail." }, { status: 403 });
  }

  const emailRedirectTo = `${appBaseUrl(request)}/auth/confirm?next=${encodeURIComponent("/login?confirmed=1")}`;
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo },
  });

  if (error) return NextResponse.json({ error: error.message || "Falha ao reenviar e-mail." }, { status: 400 });

  return NextResponse.json({ ok: true, email });
}
