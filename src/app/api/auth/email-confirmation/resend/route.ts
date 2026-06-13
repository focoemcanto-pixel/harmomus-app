import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCheckoutSession } from "@/lib/stripe/client";
import { sendEmail } from "@/lib/email/send-email";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function appBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || new URL(request.url).origin;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    .select("id,email,pending_email,onboarding_status,migrated_from_pms,requires_password_setup")
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

async function resendMigrationPasswordSetupEmail(supabase: any, request: Request, email: string) {
  const callbackUrl = new URL("/auth/confirm/callback", appBaseUrl(request));
  callbackUrl.searchParams.set("type", "recovery");
  callbackUrl.searchParams.set("next", "/redefinir-senha?migration=1");

  return supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });
}

function confirmationHtml(link: string, email: string) {
  return `
  <div style="font-family:Arial,sans-serif;background:#06080d;color:#fff;padding:32px">
    <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:26px">Confirme seu e-mail</h1>
      <p style="color:#d1d5db;line-height:1.6">Recebemos uma solicitação para confirmar este e-mail no Harmomus:</p>
      <p style="color:#67e8f9;font-weight:700">${email}</p>
      <a href="${link}" style="display:inline-block;margin-top:18px;background:#22d3ee;color:#020617;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:14px">Confirmar e-mail</a>
      <p style="margin-top:24px;color:#9ca3af;font-size:12px;line-height:1.5">Este link expira em 24 horas. Se você não pediu isso, ignore esta mensagem.</p>
    </div>
  </div>`;
}

async function sendCustomConfirmation(admin: any, request: Request, profile: any, email: string) {
  const targetEmail = normalizeEmail(email);
  if (!profile?.id) throw new Error("Perfil não encontrado.");
  if (!isValidEmail(targetEmail)) throw new Error("Informe um e-mail válido.");

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", targetEmail)
    .neq("id", profile.id)
    .limit(1)
    .maybeSingle();

  if (existing?.id) throw new Error("Este e-mail já está em uso em outra conta.");

  const code = randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const confirmationUrl = new URL("/confirmar-email", appBaseUrl(request));
  confirmationUrl.searchParams.set("code", code);

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      pending_email: targetEmail,
      email_confirmation_code: code,
      email_confirmation_expires_at: expiresAt,
      onboarding_status: "pending_email_confirmation",
      onboarding_step: "email_confirmation_sent",
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (updateError) throw new Error(updateError.message);

  const result = await sendEmail({
    to: targetEmail,
    subject: "Confirme seu e-mail no Harmomus",
    html: confirmationHtml(confirmationUrl.toString(), targetEmail),
    text: `Confirme seu e-mail no Harmomus: ${confirmationUrl.toString()}`,
  });

  if (!result.ok) throw new Error(result.error || "Falha ao enviar confirmação.");
  return { email: targetEmail };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedEmail = normalizeEmail(body?.email);
    const newEmail = normalizeEmail(body?.newEmail);
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

      const profile = await safeMarkProfilePending(admin, stripeContext.userId, stripeContext.email);
      const sent = await sendCustomConfirmation(admin, request, profile, stripeContext.email);
      return NextResponse.json({ ok: true, email: sent.email });
    }

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    let email = requestedEmail || normalizeEmail(auth.user?.email);

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

    email = newEmail || normalizeEmail(profile.pending_email) || normalizeEmail(profile.email) || email;
    const sent = await sendCustomConfirmation(admin, request, profile, email);

    return NextResponse.json({ ok: true, email: sent.email });
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
