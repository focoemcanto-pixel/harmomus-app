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
    .select("id,slug,trial_days")
    .eq("slug", normalizedPlanSlug)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar plano: ${error.message}`);
  if (!plan?.id || plan.slug === "free") throw new Error("Plano inválido para checkout.");

  const stripePriceId = resolvePlanPriceId(plan.slug);
  if (!stripePriceId) throw new Error(`Plano ${plan.slug} sem Price ID configurado no ambiente.`);

  return { ...plan, stripePriceId };
}

async function getPlanById(supabase: any, planId: string) {
  const { data: plan, error } = await supabase
    .from("plans")
    .select("id,slug,trial_days")
    .eq("id", planId)
    .single();

  if (error) throw new Error(`Falha ao buscar plano: ${error.message}`);
  if (!plan?.id) throw new Error("Plano não encontrado.");

  const stripePriceId = resolvePlanPriceId(plan.slug);
  if (!stripePriceId) throw new Error(`Plano ${plan.slug} sem Price ID configurado no ambiente.`);

  return { ...plan, stripePriceId };
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
  const supabase = (await createClient()) as any;
  return createStripeCheckoutWithSupabase(supabase, userId, email, planId, fallbackOrigin);
}

export async function startStripeCheckoutForSignup(userId: string, email: string, planSlug: string, fallbackOrigin?: string | null) {
  const supabase = createSupabaseAdminClient() as any;
  const plan = await getPlanBySlug(supabase, planSlug);
  return createStripeCheckoutWithSupabase(supabase, userId, email, plan.id, fallbackOrigin, {
    source: "paid_signup",
  });
}

export async function startFastStripeCheckoutForSignup(input: {
  userId: string;
  email: string;
  planSlug: string;
  fallbackOrigin?: string | null;
  fullName?: string | null;
  phone?: string | null;
  username?: string | null;
}) {
  assertStripeReady();

  const admin = createSupabaseAdminClient() as any;
  const plan = await getPlanBySlug(admin, input.planSlug);
  const base = resolveAppUrl(input.fallbackOrigin);

  return createCheckoutSession({
    customerEmail: input.email,
    priceId: plan.stripePriceId,
    successUrl: `${base}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/checkout/cancelado`,
    trialDays: plan.trial_days,
    metadata: {
      user_id: input.userId,
      email: input.email,
      plan_slug: plan.slug,
      full_name: input.fullName ?? undefined,
      phone: input.phone ?? undefined,
      username: input.username ?? undefined,
      source: "paid_signup",
    },
  });
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
  const [{ data: sub }, plan] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).single(),
    getPlanById(supabase, planId),
  ]);
  if (!sub?.stripe_subscription_id) throw new Error("Assinatura inválida para upgrade");
  await updateSubscription(sub.stripe_subscription_id, plan.stripePriceId);
  await supabase.from("subscriptions").update({ plan_id: planId, stripe_price_id: plan.stripePriceId, updated_at: new Date().toISOString() }).eq("id", sub.id);
}
