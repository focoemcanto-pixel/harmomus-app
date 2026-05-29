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

async function getStripeContext(sessionId: string) {
  const session = await getCheckoutSession(sessionId);
  return {
    email: normalizeEmail(session?.metadata?.email ?? session?.customer_details?.email ?? session?.customer_email) || null,
    userId: String(session?.metadata?.user_id ?? "").trim() || null,
  };
}

async function findPendingProfileByEmail(admin: any, email: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,onboarding_status,migrated_from_pms,requires_password_setup")
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
    .select("id,email,onboarding_status,migrated_from_pms,requires_password_setup")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

async function safeMarkProfilePending(admin: any, userId: string | null, email: string) {
  const profile = (await findPendingProfileById(admin, userId)) ?? (await findPendingProfileByEmail(admin, email));
  if (!profile?.id) return null;

  if (String(profile.onboarding_status ?? "") !== "pending_email_confirmation") {
    await admin
      .from("profiles")
      .update({ onboarding_status: "pending_email_confirmation", onboarding_step: "waiting_email_confirmation" })
      .eq("id", profile.id);
  }

  return profile;
}

async function findLegacyMember(admin: any, email: string) {
  const { data, error } = await admin
    .from("legacy_members")
    .select("id,email,legacy_plan_slug,legacy_status,migrated,password_created")
    .ilike("email", email)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

function isMigratedPasswordSetupPending(profile: any, legacyMember: any) {
  const legacyEligible =
    !!legacyMember &&
    String(legacyMember.legacy_plan_slug ?? "").toLowerCase() === "free" &&
    String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
    !legacyMember.password_created;

  return legacyEligible || (profile?.migrated_from_pms && profile?.requires_password_setup);
}

async function resendSignupEmail(supabase: any, request: Request, email: string) {
  const emailRedirectTo = `${appBaseUrl(request)}/auth/confirm?next=${encodeURIComponent("/login?confirmed=1")}`;

  return supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo },
  });
}

async function resendMigrationPasswordSetupEmail(supabase: any, request: Request, email: string) {
  const callbackUrl = new URL("/auth/confirm/callback", appBaseUrl(request));
  callbackUrl.searchParams.set("type", "recovery");
  callbackUrl.searchParams.set("next", "/redefinir-senha?migration=1");

  return supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedEmail = normalizeEmail(body?.email);
    const sessionId = String(body?.sessionId ?? "").trim();
    const migration = body?.migration === true || body?.migration === "1";

    const admin = createSupabaseAdminClient() as any;
    const supabase = await createClient();

    if (sessionId) {
      const stripeContext = await getStripeContext(sessionId).catch((error) => {
        console.error("[email-confirmation.resend] sessão Stripe inválida", error);
        return null;
      });

      if (!stripeContext?.email) {
        return NextResponse.json({ error: "Sessão de checkout inválida para reenviar confirmação." }, { status: 403 });
      }

      if (requestedEmail && requestedEmail !== stripeContext.email) {
        return NextResponse.json({ error: "E-mail não corresponde à sessão de checkout." }, { status: 403 });
      }

      await safeMarkProfilePending(admin, stripeContext.userId, stripeContext.email).catch((error) => {
        console.error("[email-confirmation.resend] não foi possível sincronizar profile pendente", error);
      });

      const { error } = await resendSignupEmail(supabase, request, stripeContext.email);
      if (error) return NextResponse.json({ error: error.message || "Falha ao reenviar e-mail." }, { status: 400 });

      return NextResponse.json({ ok: true, email: stripeContext.email });
    }

    let email = requestedEmail;
    let userId: string | null = null;

    if (!email) {
      const { data: auth } = await supabase.auth.getUser();
      email = normalizeEmail(auth.user?.email);
      userId = auth.user?.id ?? null;
    }

    if (!email) return NextResponse.json({ error: "E-mail não encontrado para reenviar confirmação." }, { status: 400 });

    const profile = (await findPendingProfileById(admin, userId)) ?? (await findPendingProfileByEmail(admin, email));
    const legacyMember = await findLegacyMember(admin, email);

    if (migration || isMigratedPasswordSetupPending(profile, legacyMember)) {
      if (!isMigratedPasswordSetupPending(profile, legacyMember)) {
        return NextResponse.json({ error: "Conta migrada não encontrada ou já ativada." }, { status: 404 });
      }

      const { error } = await resendMigrationPasswordSetupEmail(supabase, request, email);
      if (error) return NextResponse.json({ error: error.message || "Falha ao reenviar e-mail de criação de senha." }, { status: 400 });

      return NextResponse.json({ ok: true, email, mode: "migration_password_setup" });
    }

    if (!profile?.id) return NextResponse.json({ error: "Cadastro pendente não encontrado para este e-mail." }, { status: 404 });

    if (String(profile.onboarding_status ?? "") !== "pending_email_confirmation") {
      return NextResponse.json({ error: "Ação disponível apenas na etapa de confirmação de e-mail." }, { status: 403 });
    }

    const resendEmail = normalizeEmail(profile.email) || email;
    const { error } = await resendSignupEmail(supabase, request, resendEmail);
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
