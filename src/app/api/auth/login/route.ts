import { NextResponse } from "next/server";

import { trackMarketingEvent } from "@/lib/communications/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncProfileOnboardingAfterAuth } from "@/lib/auth/onboarding";
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

  return message.includes("email not confirmed") || message.includes("email_not_confirmed") || code.includes("email_not_confirmed");
}

function hasStaleSignupState(profile: any) {
  const status = String(profile?.onboarding_status ?? "").trim().toLowerCase();
  const step = String(profile?.onboarding_step ?? "").trim().toLowerCase();
  return status === "pending_email_confirmation" || step === "signup_started" || step === "email_confirmation_reminder";
}

async function unlockLoginForPendingEmail(email: string) {
  const admin = createSupabaseAdminClient() as any;
  const { data: profile } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (!profile?.id) return false;

  const { error } = await admin.auth.admin.updateUserById(profile.id, { email_confirm: true });
  if (error) return false;

  await admin.from("profiles").update({ onboarding_status: "pending_email_confirmation", onboarding_step: "email_confirmation_reminder", updated_at: new Date().toISOString() }).eq("id", profile.id);
  return true;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectPath = normalizeRedirect(String(formData.get("redirect") ?? ""));
  const supabase = await createClient();

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
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'E-mail ou senha inválidos. Se você redefiniu a senha agora, solicite um novo link e tente novamente.');
    url.searchParams.set('redirect', redirectPath);
    return NextResponse.redirect(url, 303);
  }

  const user = data.user;
  let isFirstLogin = false;

  if (user?.id) {
    await trackMarketingEvent(supabase as any, { userId: user.id, eventKey: 'login', eventLabel: 'Login' });

    const admin = createSupabaseAdminClient() as any;
    const { data: profile } = await admin.from('profiles').select('full_name,email,phone,role,last_login_at,onboarding_status,onboarding_step').eq('id', user.id).maybeSingle();

    isFirstLogin = !profile?.last_login_at;

    const profilePatch: Record<string, unknown> = { last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (hasStaleSignupState(profile)) {
      profilePatch.onboarding_status = 'active';
      profilePatch.onboarding_step = 'completed';
    }

    await admin.from('profiles').update(profilePatch).eq('id', user.id);
    await syncProfileOnboardingAfterAuth({ userId: user.id, successfulLogin: true, authUser: user as any });

    await dispatchWebhookEvent({
      event: 'user.login',
      source: 'auth.login',
      recipient: { name: profile?.full_name ?? null, email: profile?.email ?? user.email, phone: profile?.phone ?? null },
      data: { user_id: user.id, email: user.email }
    });

    if (String((profile as any)?.role ?? '').trim().toLowerCase() === 'admin') {
      return NextResponse.redirect(new URL('/admin', request.url), 303);
    }
  }

  const target = new URL(redirectPath || '/', request.url);
  if (isFirstLogin) target.searchParams.set('meta_complete_registration', '1');

  return NextResponse.redirect(target, 303);
}
