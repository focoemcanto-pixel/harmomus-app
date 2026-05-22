import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession, createCustomerPortalSession, getOrCreateCustomer, updateSubscription } from "@/lib/stripe/client";

function getAppUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("Configuração ausente: NEXT_PUBLIC_APP_URL.");
  return base;
}

function assertStripeReady() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Configuração ausente: STRIPE_SECRET_KEY.");
  }
}

function assertPlanPrice(plan: { slug: string; stripe_price_id: string | null }) {
  if (["plus", "premium"].includes(plan.slug) && !plan.stripe_price_id) {
    throw new Error(`Plano ${plan.slug} sem price_id no Stripe.`);
  }
}

export async function startStripeCheckout(userId: string, email: string, planId: string) {
  assertStripeReady();
  const supabase = (await createClient()) as any;
  const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).single();

  if (!plan) throw new Error("Plano não encontrado.");
  assertPlanPrice(plan);
  if (!plan.stripe_price_id) throw new Error("Plano sem price_id no Stripe.");

  const { data: existing } = await supabase.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const customerId = await getOrCreateCustomer({
    email,
    userId,
    existingCustomerId: existing?.stripe_customer_id ?? existing?.gateway_customer_id,
  });

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_id: planId,
      status: "pending",
      gateway: "stripe",
      stripe_customer_id: customerId,
      gateway_customer_id: customerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  const base = getAppUrl();

  return createCheckoutSession({
    customerId,
    priceId: plan.stripe_price_id,
    successUrl: `${base}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/checkout/cancelado`,
    trialDays: plan.trial_days,
  });
}

export async function createPortal(userId: string, email: string) {
  assertStripeReady();
  const supabase = (await createClient()) as any;
  const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const customerId = await getOrCreateCustomer({
    email,
    userId,
    existingCustomerId: sub?.stripe_customer_id ?? sub?.gateway_customer_id,
  });

  if (!sub?.id) {
    await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        status: "pending",
        gateway: "stripe",
        stripe_customer_id: customerId,
        gateway_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  return createCustomerPortalSession(customerId, `${getAppUrl()}/assinatura`);
}

export async function changeSubscriptionPlan(userId: string, planId: string) {
  const supabase = (await createClient()) as any;
  const [{ data: sub }, { data: plan }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).single(),
    supabase.from("plans").select("*").eq("id", planId).single(),
  ]);
  if (!sub?.stripe_subscription_id || !plan?.stripe_price_id) throw new Error("Assinatura/plano inválidos para upgrade");
  await updateSubscription(sub.stripe_subscription_id, plan.stripe_price_id);
  await supabase.from("subscriptions").update({ plan_id: planId, stripe_price_id: plan.stripe_price_id, updated_at: new Date().toISOString() }).eq("id", sub.id);
}
