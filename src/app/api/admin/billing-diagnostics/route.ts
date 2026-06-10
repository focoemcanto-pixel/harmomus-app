import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { resolveEffectivePlan } from "@/lib/access/subscription-plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function mask(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length <= 10) return `${text.slice(0, 3)}***`;
  return `${text.slice(0, 6)}***${text.slice(-4)}`;
}

export async function GET() {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!context.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient() as any;

  const [{ data: subscriptions, error: subscriptionsError }, { data: billingEvents, error: billingEventsError }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id,user_id,plan_id,status,gateway,stripe_customer_id,gateway_customer_id,stripe_subscription_id,gateway_subscription_id,stripe_price_id,current_period_end,next_billing_at,trial_ends_at,auto_renew,cancel_at_period_end,canceled_at,last_webhook_event,created_at,updated_at,plan:plans(slug,name)")
      .order("updated_at", { ascending: false })
      .limit(20),
    admin
      .from("billing_events")
      .select("id,provider,event_type,processed,created_at,payload")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (subscriptionsError) {
    return NextResponse.json({ error: subscriptionsError.message }, { status: 500 });
  }

  if (billingEventsError) {
    return NextResponse.json({ error: billingEventsError.message }, { status: 500 });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    currentUser: {
      effectiveSlug: context.effectiveSlug,
      isAdmin: context.isAdmin,
      profileId: context.profile?.id ?? null,
      profileEmail: context.profile?.email ?? null,
      currentSubscription: context.subscription
        ? {
            id: context.subscription.id,
            status: context.subscription.status,
            planId: context.subscription.plan_id,
            stripeCustomerId: mask(context.subscription.stripe_customer_id),
            stripeSubscriptionId: mask(context.subscription.stripe_subscription_id),
            currentPeriodEnd: context.subscription.current_period_end,
            nextBillingAt: context.subscription.next_billing_at,
            lastWebhookEvent: context.subscription.last_webhook_event,
            updatedAt: context.subscription.updated_at,
          }
        : null,
    },
    environment: {
      hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      hasStripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      hasPremiumPriceId: Boolean(process.env.STRIPE_PREMIUM_PRICE_ID),
      hasPlusPriceId: Boolean(process.env.STRIPE_PLUS_PRICE_ID),
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    },
    recentSubscriptions: (subscriptions ?? []).map((subscription: any) => {
      const effectiveSlug = resolveEffectivePlan({ subscription, plan: subscription.plan });
      const contractedSlug = String(subscription.plan?.slug ?? "").toLowerCase();
      const accessLabel = contractedSlug === "premium" && effectiveSlug === "free"
        ? "Plano Premium cancelado/pendente"
        : effectiveSlug === "premium"
          ? "Premium com acesso ativo"
          : effectiveSlug;

      return {
        id: subscription.id,
        userId: subscription.user_id,
        plan: subscription.plan,
        effectiveSlug,
        accessLabel,
        status: subscription.status,
        gateway: subscription.gateway,
        stripeCustomerId: mask(subscription.stripe_customer_id),
        gatewayCustomerId: mask(subscription.gateway_customer_id),
        stripeSubscriptionId: mask(subscription.stripe_subscription_id),
        gatewaySubscriptionId: mask(subscription.gateway_subscription_id),
        stripePriceId: mask(subscription.stripe_price_id),
        currentPeriodEnd: subscription.current_period_end,
        nextBillingAt: subscription.next_billing_at,
        trialEndsAt: subscription.trial_ends_at,
        autoRenew: subscription.auto_renew,
        canceledAt: subscription.canceled_at,
        lastWebhookEvent: subscription.last_webhook_event,
        createdAt: subscription.created_at,
        updatedAt: subscription.updated_at,
      };
    }),
    recentBillingEvents: (billingEvents ?? []).map((event: any) => ({
      id: event.id,
      provider: event.provider,
      eventType: event.event_type,
      processed: event.processed,
      createdAt: event.created_at,
      stripeEventId: event.payload?.id ?? null,
      stripeObjectType: event.payload?.data?.object?.object ?? null,
      stripeCustomerId: mask(event.payload?.data?.object?.customer),
      stripeSubscriptionId: mask(event.payload?.data?.object?.subscription ?? event.payload?.data?.object?.id),
    })),
  });
}
