import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cancelSubscriptionAtPeriodEnd } from "@/lib/stripe/client";

function appUrl(path: string, req: Request) {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL || req.url);
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.redirect(appUrl("/login", req), 303);
    }

    const supabase = createSupabaseAdminClient() as any;

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) {
      throw new Error(`Falha ao buscar assinatura: ${subscriptionError.message}`);
    }

    if (!subscription?.stripe_subscription_id) {
      return NextResponse.redirect(
        appUrl(
          "/assinatura?error=Nenhuma assinatura ativa encontrada",
          req,
        ),
        303,
      );
    }

    const stripeSubscription = await cancelSubscriptionAtPeriodEnd(
      subscription.stripe_subscription_id,
    );

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        auto_renew: false,
        current_period_end: stripeSubscription.current_period_end
          ? new Date(
              stripeSubscription.current_period_end * 1000,
            ).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id)
      .eq("user_id", user.id);

    if (updateError) {
      throw new Error(`Assinatura cancelada no Stripe, mas falhou ao atualizar o banco: ${updateError.message}`);
    }

    return NextResponse.redirect(
      appUrl(
        "/assinatura?message=Assinatura programada para cancelamento no fim do ciclo.",
        req,
      ),
      303,
    );
  } catch (error) {
    return NextResponse.redirect(
      appUrl(
        `/assinatura?error=${encodeURIComponent(
          error instanceof Error
            ? error.message
            : "Erro ao cancelar assinatura",
        )}`,
        req,
      ),
      303,
    );
  }
}
