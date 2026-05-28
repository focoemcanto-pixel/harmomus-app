import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

const ALLOWED_TYPES = new Set<EmailOtpType>(["signup", "recovery", "magiclink", "email_change"]);

function normalizeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/")) return "/";
  return raw;
}

function isPaidPlan(planSlug: string) {
  return planSlug !== "free";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = normalizeNext(url.searchParams.get("next"));

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.redirect(new URL("/login?error=callback", request.url), 303);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    console.error("[auth.confirm] verifyOtp failed", error);
    return NextResponse.redirect(new URL("/login?error=callback", request.url), 303);
  }

  const { data: authUser } = await supabase.auth.getUser();
  const user = authUser.user;

  let redirectPath = next;

  if (user?.id) {
    const fullName = String(user.user_metadata?.full_name ?? "").trim() || user.email || "";
    const planSlug = String(user.user_metadata?.plan_slug ?? "free").toLowerCase();

    await ensureUserAccess({
      id: user.id,
      email: user.email,
      fullName,
      selectedPlanSlug: planSlug,
    });

    await (supabase as any)
      .from("profiles")
      .update({
        onboarding_status: "email_confirmed",
        onboarding_step: "waiting_first_login",
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (type === "signup" && isPaidPlan(planSlug)) {
      redirectPath = `/api/billing/checkout?plan=${encodeURIComponent(planSlug)}`;
    }

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
          type,
          plan: planSlug,
        },
      });

      if (type === "signup" && planSlug === "free") {
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
      console.error("[auth.confirm] webhook falhou", webhookError);
    }
  }

  return NextResponse.redirect(new URL(redirectPath, request.url), 303);
}
