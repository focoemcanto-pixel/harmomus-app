import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { syncProfileOnboardingAfterAuth } from "@/lib/auth/onboarding";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

const ALLOWED_TYPES = new Set(["signup", "email", "recovery"]);

function confirmationErrorUrl(request: Request, reason = "callback") {
  return new URL(`/auth/confirm?error=${encodeURIComponent(reason)}`, request.url);
}

function normalizeNext(raw: string | null, type?: string) {
  if (!raw || !raw.startsWith("/")) return type === "recovery" ? "/redefinir-senha" : "/login?confirmed=1";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") ?? "signup";
  const next = normalizeNext(url.searchParams.get("next"), type);
  const supabase = await createClient();

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error("[auth.confirm.callback] exchangeCodeForSession failed", exchangeError);
      return NextResponse.redirect(confirmationErrorUrl(request, "callback"), 303);
    }
  } else {
    if (!tokenHash || !ALLOWED_TYPES.has(type)) {
      return NextResponse.redirect(confirmationErrorUrl(request, "link_invalido"), 303);
    }

    const otpType = (type === "email" ? "signup" : type) as EmailOtpType;
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (error) {
      console.error("[auth.confirm.callback] verifyOtp failed", error);
      const reason = String(error.message ?? "").toLowerCase().includes("expired") ? "link_expirado" : "callback";
      return NextResponse.redirect(confirmationErrorUrl(request, reason), 303);
    }
  }

  const { data: authUser } = await supabase.auth.getUser();
  const user = authUser.user;

  if (user?.id && type !== "recovery") {
    const fullName = String(user.user_metadata?.full_name ?? "").trim() || user.email || "";
    const planSlug = String(user.user_metadata?.plan_slug ?? "free").toLowerCase();
    const eventType = (type === "email" ? "signup" : type) as EmailOtpType;

    await ensureUserAccess({
      id: user.id,
      email: user.email,
      fullName,
      selectedPlanSlug: planSlug,
    });

    await syncProfileOnboardingAfterAuth({ userId: user.id, authUser: user as any });

    try {
      await dispatchWebhookEvent({
        event: "user.email_confirmed",
        source: "auth.email_confirmation",
        recipient: {
          name: fullName,
          email: user.email ?? null,
          phone: String(user.user_metadata?.phone ?? "") || null,
        },
        data: {
          user_id: user.id,
          type: eventType,
          plan: planSlug,
        },
      });

      if (eventType === "signup" && planSlug === "free") {
        await dispatchWebhookEvent({
          event: "plan.free_activated",
          source: "auth.signup_confirmed",
          recipient: {
            name: fullName,
            email: user.email ?? null,
            phone: String(user.user_metadata?.phone ?? "") || null,
          },
          data: {
            user_id: user.id,
            plan: "free",
            activated_at: new Date().toISOString(),
          },
        });
      }
    } catch (webhookError) {
      console.error("[auth.confirm.callback] webhook falhou", webhookError);
    }
  }

  return NextResponse.redirect(new URL(next, request.url), 303);
}
