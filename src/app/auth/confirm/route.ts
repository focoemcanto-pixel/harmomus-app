import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

const ALLOWED_TYPES = new Set(["signup", "email"]);

function confirmationErrorUrl(request: Request, reason = "callback") {
  return new URL(`/verifique-email?error=${encodeURIComponent(reason)}`, request.url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.redirect(confirmationErrorUrl(request, "link_invalido"), 303);
  }

  const otpType = (type === "email" ? "signup" : type) as EmailOtpType;
  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: otpType,
  });

  if (error) {
    console.error("[auth.confirm] verifyOtp failed", error);
    const reason = String(error.message ?? "").toLowerCase().includes("expired") ? "link_expirado" : "callback";
    return NextResponse.redirect(confirmationErrorUrl(request, reason), 303);
  }

  const { data: authUser } = await supabase.auth.getUser();
  const user = authUser.user;

  if (user?.id) {
    const fullName = String(user.user_metadata?.full_name ?? "").trim() || user.email || "";
    const planSlug = String(user.user_metadata?.plan_slug ?? "free").toLowerCase();

    await ensureUserAccess({
      id: user.id,
      email: user.email,
      fullName,
      selectedPlanSlug: planSlug,
    });

    const profileUpdate = await (supabase as any)
      .from("profiles")
      .update({
        onboarding_status: "email_confirmed",
        onboarding_step: "waiting_first_login",
      })
      .eq("id", user.id);

    if (profileUpdate.error) {
      console.error("[auth.confirm] falha ao atualizar onboarding", profileUpdate.error);
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
          type: otpType,
          plan: planSlug,
        },
      });

      if (otpType === "signup" && planSlug === "free") {
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

  return NextResponse.redirect(new URL("/login?confirmed=1", request.url), 303);
}
