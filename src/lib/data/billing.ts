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

function resolvePlanPriceId(planSlug: string, dbPriceId?: string | null) {
  if (dbPriceId) return dbPriceId;
  if (planSlug === "plus") return process.env.STRIPE_PLUS_PRICE_ID?.trim() || null;
  if (planSlug === "premium") return process.env.STRIPE_PREMIUM_PRICE_ID?.trim() || null;
  if (planSlug === "ministry_10") return process.env.STRIPE_MINISTRY_10_PRICE_ID?.trim() || null;
  if (planSlug === "ministry_20") return process.env.STRIPE_MINISTRY_20_PRICE_ID?.trim() || null;
  if (planSlug === "ministry_40") return process.env.STRIPE_MINISTRY_40_PRICE_ID?.trim() || null;
  return null;
}

async function getPlanBySlug(admin: any, planSlug: string) {
  const normalizedPlanSlug = String(planSlug ?? "").trim().toLowerCase();
  const { data: plan, error } = await admin
    .from("plans")
    .select("id,slug,trial_days,stripe_price_id")
    .eq("slug", normalizedPlanSlug)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar plano: ${error.message}`);
  if (!plan?.id || plan.slug === "free") throw new Error("Plano inválido para checkout.");

  const stripePriceId = resolvePlanPriceId(plan.slug, plan.stripe_price_id);
  if (!stripePriceId) throw new Error(`Plano ${plan.slug} sem Price ID configurado no ambiente.`);

  return { ...plan, stripePriceId };
}

async function getPlanById(supabase: any, planId: string) {
  const { data: plan, error } = await supabase
    .from("plans")
    .select("id,slug,trial_days,stripe_price_id")
    .eq("id", planId)
    .single();

  if (error) throw new Error(`Falha ao buscar plano: ${error.message}`);
  if (!plan?.id) throw new Error("Plano não encontrado.");

  const stripePriceId = resolvePlanPriceId(plan.slug, plan.stripe_price_id);
  if (!stripePriceId) throw new Error(`Plano ${plan.slug} sem Price ID configurado no ambiente.`);

  return { ...plan, stripePriceId };
}

async function savePendingStripeSubscription(supabase: any, input: { userId: string; planId: string; customerId: string }) {
  const now = new Date().toISOString();
  const payload = {
    user_id: input.userId,
    plan_id: input.planId,
    status: "pending",
    gateway: "stripe",
    stripe_customer_id: input.customerId,
    gateway_customer_id: input.customerId,
    updated_at: now,
  };

  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Falha ao verificar assinatura existente: ${existingError.message}`);
  }

  const result = existing?.id
    ? await supabase.from("subscriptions").update(payload).eq("id", existing.id)
    : await supabase.from("subscriptions").insert({ ...payload, created_at: now });

  if (result.error) {
    throw new Error(`Falha ao preparar assinatura Stripe: ${result.error.message}`);
  }
}

async function createStripeCheckoutWithSupabase(
  supabase: any,
  userId: string,
  email: string,
  planId: string,
  fallbackOrigin?: string | null,
  metadata?: Record<string, string | null | undefined>,
) {
  assertStripeReady();

  const [{ data: existing }, plan] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getPlanById(supabase, planId),
  ]);

  const customerId = await getOrCreateCustomer({
    email,
    userId,
    existingCustomerId: existing?.stripe_customer_id ?? existing?.gateway_customer_id,
  });

  await savePendingStripeSubscription(supabase, { userId, planId, customerId });

  const base = resolveAppUrl(fallbackOrigin);

  return createCheckoutSession({
    customerId,
    priceId: plan.stripePriceId,
    successUrl: `${base}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/checkout/cancelado`,
    trialDays: plan.trial_days,
    metadata: {
      user_id: userId,
      email,
      plan_slug: plan.slug,
      ...metadata,
    },
  });
}

export async function startStripeCheckout(userId: string, email: string, planId: string, fallbackOrigin?: string | null) {
  const supabase = createSupabaseAdminClient() as any;
  return createStripeCheckoutWithSupabase(supabase, userId, email, planId, fallbackOrigin);
}

export async function startStripeCheckoutForSignup(userId: string, email: string, planSlug: string, fallbackOrigin?: string | null) {
  const supabase = createSupabaseAdminClient() as any;
  const plan = await getPlanBySlug(supabase, planSlug);
  return createStripeCheckoutWithSupabase(supabase, userId, email, plan.id, fallbackOrigin, {
    source: "paid_signup",
  });
}

export async function createPortal(userId: string, email: string, fallbackOrigin?: string | null) {
  assertStripeReady();
  const supabase = createSupabaseAdminClient() as any;
  const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const customerId = await getOrCreateCustomer({
    email,
    userId,
    existingCustomerId: sub?.stripe_customer_id ?? sub?.gateway_customer_id,
  });

  if (!sub?.id) {
    await savePendingStripeSubscription(supabase, { userId, planId: sub?.plan_id, customerId });
  }

  return createCustomerPortalSession(customerId, `${resolveAppUrl(fallbackOrigin)}/assinatura`);
}

export async function changeSubscriptionPlan(userId: string, planId: string) {
  const supabase = createSupabaseAdminClient() as any;
  const [{ data: sub }, plan] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).single(),
    getPlanById(supabase, planId),
  ]);
  if (!sub?.stripe_subscription_id) throw new Error("Assinatura inválida para upgrade");
  await updateSubscription(sub.stripe_subscription_id, plan.stripePriceId);
  const { error } = await supabase.from("subscriptions").update({ plan_id: planId, stripe_price_id: plan.stripePriceId, updated_at: new Date().toISOString() }).eq("id", sub.id);
  if (error) throw new Error(`Falha ao atualizar plano local: ${error.message}`);
}
