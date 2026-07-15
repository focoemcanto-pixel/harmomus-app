import { NextResponse } from "next/server";

import { trackMarketingEvent } from "@/lib/communications/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncProfileOnboardingAfterAuth } from "@/lib/auth/onboarding";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

function normalizeRedirect(raw: string) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /^\/https?:/i.test(raw)) return "/";
  return raw;
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
  try {
    const admin = createSupabaseAdminClient() as any;
    const { data: profile } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (!profile?.id) return false;

    const { error } = await admin.auth.admin.updateUserById(profile.id, { email_confirm: true });
    if (error) return false;

    await admin
      .from("profiles")
      .update({
        onboarding_status: "pending_email_confirmation",
        onboarding_step: "email_confirmation_reminder",
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    return true;
  } catch (error) {
    console.error("[auth.login] unlock pending email failed", error);
    return false;
  }
}

export async function POST(request: Request) {
  let redirectPath = "/";

  try {
    const formData = await request.formData();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    redirectPath = normalizeRedirect(String(formData.get("redirect") ?? ""));
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

    if (signInError || !data.user?.id) {
      const url = new URL("/login", request.url);
      url.searchParams.set("error", "E-mail ou senha inválidos.");
      url.searchParams.set("redirect", redirectPath);
      return NextResponse.redirect(url, 303);
    }

    const user = data.user;
    let isFirstLogin = false;
    let isAdmin = false;

    // Everything below is secondary. A telemetry, profile or webhook failure
    // must never block an already successful Supabase login.
    try {
      await trackMarketingEvent(supabase as any, {
        userId: user.id,
        eventKey: "login",
        eventLabel: "Login",
      });
    } catch (error) {
      console.error("[auth.login] marketing tracking failed", error);
    }

    try {
      const admin = createSupabaseAdminClient() as any;
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("full_name,email,phone,role,last_login_at,onboarding_status,onboarding_step")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("[auth.login] profile lookup failed", profileError);
      } else {
        isFirstLogin = !profile?.last_login_at;
        isAdmin = String(profile?.role ?? "").trim().toLowerCase() === "admin";

        const profilePatch: Record<string, unknown> = {
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (hasStaleSignupState(profile)) {
          profilePatch.onboarding_status = "active";
          profilePatch.onboarding_step = "completed";
        }

        const { error: updateError } = await admin.from("profiles").update(profilePatch).eq("id", user.id);
        if (updateError) console.error("[auth.login] profile update failed", updateError);

        try {
          await dispatchWebhookEvent({
            event: "user.login",
            source: "auth.login",
            recipient: {
              name: profile?.full_name ?? null,
              email: profile?.email ?? user.email,
              phone: profile?.phone ?? null,
            },
            data: { user_id: user.id, email: user.email },
          });
        } catch (error) {
          console.error("[auth.login] login webhook failed", error);
        }
      }
    } catch (error) {
      console.error("[auth.login] profile side effects failed", error);
    }

    try {
      await syncProfileOnboardingAfterAuth({
        userId: user.id,
        successfulLogin: true,
        authUser: user as any,
      });
    } catch (error) {
      console.error("[auth.login] onboarding sync failed", error);
    }

    const target = new URL(isAdmin ? "/admin" : redirectPath || "/", request.url);
    if (!isAdmin && isFirstLogin) target.searchParams.set("meta_complete_registration", "1");

    return NextResponse.redirect(target, 303);
  } catch (error) {
    console.error("[auth.login] unexpected route failure", error);
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "Não foi possível concluir o login. Tente novamente.");
    url.searchParams.set("redirect", redirectPath);
    return NextResponse.redirect(url, 303);
  }
}
