import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cancelSubscriptionAtPeriodEnd } from "@/lib/stripe/client";
import { cancelSubscription as cancelAsaasSubscription } from "@/lib/asaas/subscriptions";

function appUrl(path: string, req: Request) {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL || req.url);
}

function normalizedGateway(subscription: any) {
  return String(subscription?.gateway ?? "stripe").trim().toLowerCase();
}

function normalizedStatus(subscription: any) {
  return String(subscription?.status ?? "").trim().toLowerCase();
}

function isCancelable(subscription: any) {
  return ["active", "trialing", "pending", "overdue"].includes(normalizedStatus(subscription));
}

function pickSubscriptionToCancel(subscriptions: any[]) {
  const rows = subscriptions ?? [];
  const cancelable = rows.filter(isCancelable);
  const asaas = cancelable.find((subscription) => normalizedGateway(subscription) === "asaas" && subscription?.gateway_subscription_id);
  if (asaas) return asaas;

  const stripe = cancelable.find((subscription) => normalizedGateway(subscription) === "stripe" && subscription?.stripe_subscription_id);
  if (stripe) return stripe;

  return rows.find((subscription) => normalizedGateway(subscription) === "asaas" && subscription?.gateway_subscription_id)
    ?? rows.find((subscription) => normalizedGateway(subscription) === "stripe" && subscription?.stripe_subscription_id)
    ?? null;
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.redirect(appUrl("/login", req), 303);
    }

    const supabase = createSupabaseAdminClient() as any;

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);

    if (subscriptionError) {
      throw new Error(`Falha ao buscar assinatura: ${subscriptionError.message}`);
    }

    const subscription = pickSubscriptionToCancel(subscriptions ?? []);
    const gateway = normalizedGateway(subscription);

    if (gateway === "asaas") {
      const asaasSubscriptionId = subscription?.gateway_subscription_id;
      if (!asaasSubscriptionId) {
        return NextResponse.redirect(appUrl("/assinatura?error=Nenhuma assinatura Asaas ativa encontrada", req), 303);
      }

      await cancelAsaasSubscription(asaasSubscriptionId);

      const { error: updateError } = await supabase
        .from("subscriptions")
        .update({
          status: "canceled",
          auto_renew: false,
          next_billing_at: null,
          current_period_end: null,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id)
        .eq("user_id", user.id)
        .eq("gateway", "asaas");

      if (updateError) {
        throw new Error(`Assinatura cancelada no Asaas, mas falhou ao atualizar o banco: ${updateError.message}`);
      }

      return NextResponse.redirect(appUrl("/assinatura?message=Assinatura Asaas cancelada.", req), 303);
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
      .eq("user_id", user.id)
      .eq("gateway", "stripe");

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
