import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession, createCustomerPortalSession, getOrCreateCustomer, updateSubscription } from "@/lib/stripe/client";

function resolveAppUrl(fallbackOrigin?: string | null) {
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, "");
  if (fallbackOrigin) return fallbackOrigin.replace(/\/$/, "");
  throw new Error("Configuração ausente: NEXT_PUBLIC_APP_URL.");
}

function assertStripeReady() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Configuração ausente: STRIPE_SECRET_KEY.");
  }
}

function resolvePlanPriceId(plan: { slug: string; stripe_price_id: string | null }) {
  if (plan.stripe_price_id) return plan.stripe_price_id;
  if (plan.slug === "plus") return process.env.STRIPE_PLUS_PRICE_ID?.trim() || null;
  if (plan.slug === "premium") return process.env.STRIPE_PREMIUM_PRICE_ID?.trim() || null;
  return null;
}

function resolveMinistryPriceId(planSlug: string) {
  if (planSlug === "ministry_10") return process.env.STRIPE_MINISTRY_10_PRICE_ID?.trim() || null;
  if (planSlug === "ministry_20") return process.env.STRIPE_MINISTRY_20_PRICE_ID?.trim() || null;
  if (planSlug === "ministry_40") return process.env.STRIPE_MINISTRY_40_PRICE_ID?.trim() || null;
  return null;
}

async function createStripeCheckoutWithSupabase(supabase: any, userId: string, email: string, planId: string, fallbackOrigin?: string | null) {
  assertStripeReady();

  const [{ data: plan }, { data: existing }] = await Promise.all([
    supabase.from("plans").select("*").eq("id", planId).single(),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!plan) throw new Error("Plano não encontrado.");
  const stripePriceId = resolvePlanPriceId(plan) ?? resolveMinistryPriceId(plan.slug);
  if (["plus", "premium", "ministry_10", "ministry_20", "ministry_40"].includes(plan.slug) && !stripePriceId) {
    throw new Error("Plano sem configuração de pagamento. Configure o Stripe Price ID no ambiente.");
  }

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

  const base = resolveAppUrl(fallbackOrigin);

  return createCheckoutSession({
    customerId,
    priceId: stripePriceId!,
    successUrl: `${base}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/checkout/cancelado`,
    trialDays: plan.trial_days,
  });
}

export async function startStripeCheckout(userId: string, email: string, planId: string, fallbackOrigin?: string | null) {
  const supabase = (await createClient()) as any;
  return createStripeCheckoutWithSupabase(supabase, userId, email, planId, fallbackOrigin);
}

export async function startStripeCheckoutForSignup(userId: string, email: string, planSlug: string, fallbackOrigin?: string | null) {
  const supabase = createSupabaseAdminClient() as any;
  const normalizedPlanSlug = String(planSlug ?? "").trim().toLowerCase();

  const { data: plan, error } = await supabase
    .from("plans")
    .select("id,slug")
    .eq("slug", normalizedPlanSlug)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar plano: ${error.message}`);
  if (!plan?.id || plan.slug === "free") throw new Error("Plano inválido para checkout.");

  return createStripeCheckoutWithSupabase(supabase, userId, email, plan.id, fallbackOrigin);
}

export async function createPortal(userId: string, email: string, fallbackOrigin?: string | null) {
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

  return createCustomerPortalSession(customerId, `${resolveAppUrl(fallbackOrigin)}/assinatura`);
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
