import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const EMAIL_WAITING_STATUSES = new Set(["pending_email_confirmation", "email_confirmed", "onboarding_completed"]);

const EMAIL_WAITING_STEPS = new Set([
  "signup_started",
  "checkout_started",
  "checkout_completed",
  "waiting_payment",
  "waiting_email_confirmation",
  "email_confirmation_reminder",
  "waiting_first_login",
]);

type SyncProfileOnboardingInput = {
  userId: string;
  successfulLogin?: boolean;
  authUser?: Record<string, unknown> | null;
};

function hasConfirmedEmail(authUser?: Record<string, unknown> | null) {
  return Boolean(authUser?.email_confirmed_at);
}

export async function syncProfileOnboardingAfterAuth(input: SyncProfileOnboardingInput) {
  if (!input.userId) return null;

  const admin = createSupabaseAdminClient() as any;
  let authUser = input.authUser ?? null;

  if (!authUser || !hasConfirmedEmail(authUser)) {
    const { data, error } = await admin.auth.admin.getUserById(input.userId);
    if (error) {
      console.error("[syncProfileOnboardingAfterAuth] Falha ao buscar usuário no Auth", error);
    } else {
      authUser = (data?.user ?? null) as Record<string, unknown> | null;
    }
  }

  const shouldCompleteEmailConfirmation = hasConfirmedEmail(authUser);
  if (!shouldCompleteEmailConfirmation) return null;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,onboarding_status,onboarding_step")
    .eq("id", input.userId)
    .maybeSingle();

  if (profileError) {
    console.error("[syncProfileOnboardingAfterAuth] Falha ao buscar profile", profileError);
    return null;
  }

  if (!profile?.id) return null;

  const onboardingStatus = String(profile.onboarding_status ?? "");
  const onboardingStep = String(profile.onboarding_step ?? "");
  const update: Record<string, unknown> = {};

  if (EMAIL_WAITING_STATUSES.has(onboardingStatus)) {
    update.onboarding_status = "active";
  }

  if (EMAIL_WAITING_STEPS.has(onboardingStep)) {
    update.onboarding_step = "completed";
  }

  if (!Object.keys(update).length) return profile;

  update.updated_at = new Date().toISOString();

  const { data: updatedProfile, error: updateError } = await admin
    .from("profiles")
    .update(update)
    .eq("id", input.userId)
    .select("id,onboarding_status,onboarding_step")
    .maybeSingle();

  if (updateError) {
    console.error("[syncProfileOnboardingAfterAuth] Falha ao sincronizar onboarding", updateError);
    return null;
  }

  return updatedProfile;
}
