import { NextResponse } from "next/server";

import { trackMarketingEvent } from "@/lib/communications/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

function normalizeRedirect(raw: string) {
  if (!raw || !raw.startsWith("/")) return "/";
  return raw;
}

function isSupportedLegacyPlan(value: unknown) {
  const slug = String(value ?? "").trim().toLowerCase();
  return ["free", "plus", "premium", "ministry_10", "ministry_20", "ministry_40"].includes(slug);
}

function isEmailNotConfirmedError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const message = String(record.message ?? "").toLowerCase();
  const code = String(record.code ?? "").toLowerCase();

  return (
    message.includes("email not confirmed") ||
    message.includes("email_not_confirmed") ||
    code.includes("email_not_confirmed")
  );
}

async function unlockLoginForPendingEmail(email: string) {
  const admin = createSupabaseAdminClient() as any;
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!profile?.id) return false;

  const { error } = await admin.auth.admin.updateUserById(profile.id, {
    email_confirm: true,
  });

  if (error) {
    console.error("[auth.login] falha ao destravar login de e-mail pendente", error);
    return false;
  }

  await admin
    .from("profiles")
    .update({
      onboarding_status: "pending_email_confirmation",
      onboarding_step: "email_confirmation_reminder",
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  return true;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectPath = normalizeRedirect(String(formData.get("redirect") ?? ""));
  const supabase = await createClient();

  if (email && !password) {
    const admin = createSupabaseAdminClient() as any;

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile?.id) {
      // Já existe perfil na plataforma nova: segue fluxo normal de login.
    } else {
      const { data: legacyMember } = await admin
        .from("legacy_members")
        .select("email,legacy_plan_slug,legacy_status,migrated,password_created,stripe_customer_id")
        .ilike("email", email)
        .maybeSingle();

      if (
        legacyMember &&
        isSupportedLegacyPlan(legacyMember.legacy_plan_slug) &&
        String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
        (!legacyMember.migrated || !legacyMember.password_created)
      ) {
        await dispatchWebhookEvent({
          event: "user.migrated",
          source: "legacy.migration",
          recipient: {
            email,
          },
          data: {
            legacy_plan_slug: legacyMember.legacy_plan_slug,
            legacy_status: legacyMember.legacy_status,
            has_stripe_customer: Boolean(legacyMember.stripe_customer_id),
          },
        });

        const url = new URL("/definir-senha-migrada", request.url);
        url.searchParams.set("email", email);
        return NextResponse.redirect(url, 303);
      }
    }
  }

  let { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError && isEmailNotConfirmedError(signInError)) {
    const unlocked = await unlockLoginForPendingEmail(email);
    if (unlocked) {
      const retry = await supabase.auth.signInWithPassword({ email, password });
      data = retry.data;
      signInError = retry.error;
    }
  }

  if (signInError) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "E-mail ou senha inválidos.");
    url.searchParams.set("redirect", redirectPath);
    return NextResponse.redirect(url, 303);
  }

  const user = data.user;
  if (user?.id) {
    await trackMarketingEvent(supabase as any, { userId: user.id, eventKey: "login", eventLabel: "Login" });

    const admin = createSupabaseAdminClient() as any;
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name,email,phone,role")
      .eq("id", user.id)
      .maybeSingle();

    await dispatchWebhookEvent({
      event: "user.login",
      source: "auth.login",
      recipient: {
        name: profile?.full_name ?? null,
        email: profile?.email ?? user.email,
        phone: profile?.phone ?? null,
      },
      data: {
        user_id: user.id,
        email: user.email,
      },
    });

    if (String((profile as any)?.role ?? "").trim().toLowerCase() === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url), 303);
    }
  }

  return NextResponse.redirect(new URL(redirectPath || "/", request.url), 303);
}
