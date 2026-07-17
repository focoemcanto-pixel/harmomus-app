import { NextResponse } from "next/server";

import { trustedAppUrl } from "@/lib/security/trusted-app-url";
import { getCheckoutSession } from "@/lib/stripe/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getStripeContext(sessionId: string) {
  const session = await getCheckoutSession(sessionId);
  return {
    email: normalizeEmail(session?.metadata?.email ?? session?.customer_details?.email ?? session?.customer_email),
    userId: String(session?.metadata?.user_id ?? "").trim() || null,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const currentEmailFromBody = normalizeEmail(body?.email);
  const sessionId = String(body?.sessionId ?? "").trim();
  const newEmail = normalizeEmail(body?.newEmail);

  if (!isValidEmail(newEmail)) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const admin = createSupabaseAdminClient() as any;

  let targetUserId = auth.user?.id ?? null;
  let currentEmail = normalizeEmail(auth.user?.email);
  let authorizedByCheckout = false;

  if (sessionId) {
    const stripeContext = await getStripeContext(sessionId).catch((error) => {
      console.error("[email-confirmation.update-email] sessão Stripe inválida", error);
      return null;
    });

    if (!stripeContext?.email) {
      return NextResponse.json({ error: "Sessão de checkout inválida para alterar e-mail." }, { status: 403 });
    }

    if (currentEmailFromBody && currentEmailFromBody !== stripeContext.email) {
      return NextResponse.json({ error: "E-mail não corresponde à sessão de checkout." }, { status: 403 });
    }

    authorizedByCheckout = true;
    currentEmail = stripeContext.email;
    targetUserId = stripeContext.userId;

    if (!targetUserId) {
      const { data: profileByEmail, error: profileByEmailError } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", stripeContext.email)
        .limit(1)
        .maybeSingle();

      if (profileByEmailError) {
        return NextResponse.json({ error: profileByEmailError.message }, { status: 400 });
      }
      targetUserId = profileByEmail?.id ?? null;
    }
  } else {
    if (authError || !targetUserId || !currentEmail) {
      return NextResponse.json({ error: "Você precisa estar autenticado para alterar o e-mail." }, { status: 401 });
    }

    if (currentEmailFromBody && currentEmailFromBody !== currentEmail) {
      return NextResponse.json({ error: "O e-mail atual não pertence à sessão autenticada." }, { status: 403 });
    }
  }

  if (!targetUserId || !currentEmail) {
    return NextResponse.json({ error: "Usuário não localizado para atualizar e-mail." }, { status: 404 });
  }

  const { data: currentProfile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id,email,onboarding_status")
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileLookupError) {
    return NextResponse.json({ error: profileLookupError.message }, { status: 400 });
  }

  if (!currentProfile?.id || normalizeEmail(currentProfile.email) !== currentEmail) {
    return NextResponse.json({ error: "A conta não corresponde ao contexto autorizado." }, { status: 403 });
  }

  if (String(currentProfile.onboarding_status ?? "") !== "pending_email_confirmation") {
    return NextResponse.json({ error: "Ação disponível apenas na etapa de confirmação de e-mail." }, { status: 403 });
  }

  const { data: emailOwner } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", newEmail)
    .neq("id", targetUserId)
    .limit(1)
    .maybeSingle();

  if (emailOwner?.id) {
    return NextResponse.json({ error: "Este e-mail já está em uso em outra conta." }, { status: 409 });
  }

  const authUpdate = await admin.auth.admin.updateUserById(targetUserId, {
    email: newEmail,
    email_confirm: false,
  });
  if (authUpdate.error) {
    return NextResponse.json({ error: authUpdate.error.message || "Falha ao atualizar usuário." }, { status: 400 });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      email: newEmail,
      pending_email: newEmail,
      onboarding_status: "pending_email_confirmation",
      onboarding_step: "waiting_email_confirmation",
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetUserId);

  if (profileError) {
    return NextResponse.json({ error: profileError.message || "Falha ao atualizar perfil." }, { status: 400 });
  }

  const confirmationUrl = trustedAppUrl("/auth/confirm", request);
  confirmationUrl.searchParams.set("next", "/login?confirmed=1");

  const { error: emailChangeError } = await supabase.auth.resend({
    type: "email_change" as any,
    email: newEmail,
    options: { emailRedirectTo: confirmationUrl.toString() },
  });

  if (emailChangeError) {
    const { error: signupFallbackError } = await supabase.auth.resend({
      type: "signup",
      email: newEmail,
      options: { emailRedirectTo: confirmationUrl.toString() },
    });

    if (signupFallbackError) {
      return NextResponse.json(
        { error: signupFallbackError.message || emailChangeError.message || "Falha ao reenviar confirmação." },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: true, email: newEmail, authorizedBy: authorizedByCheckout ? "checkout" : "session" });
}
