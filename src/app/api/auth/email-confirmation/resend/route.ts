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

function getStripeCustomerId(session: any) {
  if (typeof session?.customer === "string") return session.customer;
  if (session?.customer?.id) return String(session.customer.id);
  return null;
}

async function getStripeContext(sessionId: string) {
  const session = await getCheckoutSession(sessionId);
  return {
    email: normalizeEmail(session?.metadata?.email ?? session?.customer_details?.email ?? session?.customer_email) || null,
    userId: String(session?.metadata?.user_id ?? "").trim() || null,
    customerId: getStripeCustomerId(session),
  };
}

async function findPendingProfileByEmail(admin: any, email: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,onboarding_status")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

async function findPendingProfileById(admin: any, userId: string | null) {
  if (!userId) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id,email,onboarding_status")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

async function findPendingProfileByStripeCustomer(admin: any, customerId: string | null, expectedEmail: string | null) {
  if (!customerId) return null;

  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("user_id")
    .or(`stripe_customer_id.eq.${customerId},gateway_customer_id.eq.${customerId}`)
    .limit(1)
    .maybeSingle();

  if (subscriptionError) throw new Error(subscriptionError.message);
  if (!subscription?.user_id) return null;

  const profile = await findPendingProfileById(admin, subscription.user_id);
  if (!profile) return null;

  const profileEmail = normalizeEmail(profile.email);
  if (expectedEmail && profileEmail && profileEmail !== expectedEmail) {
    console.error("[email-confirmation.resend] Stripe customer matched a different profile email", {
      expectedEmail,
      profileEmail,
      userId: profile.id,
      customerId,
    });
    return null;
  }

  return profile;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedEmail = normalizeEmail(body?.email);
    const sessionId = String(body?.sessionId ?? "").trim();

    const admin = createSupabaseAdminClient() as any;
    const supabase = await createClient();

    let email = requestedEmail;
    let customerId: string | null = null;
    let sessionUserId: string | null = null;

    if (sessionId) {
      const stripeContext = await getStripeContext(sessionId).catch((error) => {
        console.error("[email-confirmation.resend] sessão Stripe inválida", error);
        return null;
      });

      if (!stripeContext?.email) {
        return NextResponse.json({ error: "Sessão de checkout inválida para reenviar confirmação." }, { status: 403 });
      }

      if (email && email !== stripeContext.email) {
        return NextResponse.json({ error: "E-mail não corresponde à sessão de checkout." }, { status: 403 });
      }

      email = stripeContext.email;
      customerId = stripeContext.customerId;
      sessionUserId = stripeContext.userId;
    }

    if (!email) {
      const { data: auth } = await supabase.auth.getUser();
      email = normalizeEmail(auth.user?.email);
      sessionUserId = auth.user?.id ?? null;
    }

    if (!email) return NextResponse.json({ error: "E-mail não encontrado para reenviar confirmação." }, { status: 400 });

    const profile =
      (await findPendingProfileById(admin, sessionUserId)) ??
      (await findPendingProfileByEmail(admin, email)) ??
      (await findPendingProfileByStripeCustomer(admin, customerId, email));

    if (!profile?.id) return NextResponse.json({ error: "Cadastro pendente não encontrado para este e-mail." }, { status: 404 });

    const profileEmail = normalizeEmail(profile.email);
    if (profileEmail && profileEmail !== email) {
      return NextResponse.json(
        { error: "O e-mail da sessão não corresponde ao e-mail cadastrado. Use a opção de alterar e-mail para corrigir." },
        { status: 409 },
      );
    }

    if (String(profile.onboarding_status ?? "") !== "pending_email_confirmation") {
      return NextResponse.json({ error: "Ação disponível apenas na etapa de confirmação de e-mail." }, { status: 403 });
    }

    const resendEmail = email;
    const emailRedirectTo = `${appBaseUrl(request)}/auth/confirm?next=${encodeURIComponent("/login?confirmed=1")}`;

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: resendEmail,
      options: { emailRedirectTo },
    });

    if (error) return NextResponse.json({ error: error.message || "Falha ao reenviar e-mail." }, { status: 400 });

    return NextResponse.json({ ok: true, email: resendEmail });
  } catch (error) {
    console.error("[email-confirmation.resend] erro inesperado", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao reenviar confirmação.",
      },
      { status: 500 },
    );
  }
}
