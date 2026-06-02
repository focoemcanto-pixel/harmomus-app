import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCheckoutSession, createCustomerPortalSession, getOrCreateCustomer, updateSubscription } from "@/lib/stripe/client";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";
import { normalizeWebhookPhone, resolveWebhookRecipientForUser } from "@/lib/webhooks/recipient";

type CheckoutMetadata = Record<string, string | null | undefined>;

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

function pickAttribution(metadata?: CheckoutMetadata | null) {
  const attribution: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = String(metadata?.[key] ?? "").trim();
    if (value) attribution[key] = value.slice(0, 500);
  }
  return attribution;
}

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

function getCheckoutStartedEvents(planSlug: string) {
  const events = ["checkout.started"];
  if (planSlug === "plus") events.push("checkout.plus.started");
  if (planSlug === "premium") events.push("checkout.premium.started");
  return events;
}

function normalizePlanFamily(slug?: string | null) {
  if (!slug) return "free";
  if (slug.startsWith("ministry")) return "ministry";
  if (slug === "premium") return "premium";
  if (slug === "plus") return "plus";
  return "free";
}

function planRank(planFamily: string) {
  if (planFamily === "free") return 0;
  if (planFamily === "plus") return 1;
  if (planFamily === "premium") return 2;
  if (planFamily === "ministry") return 3;
  return 0;
}

function getPlanActivatedEvent(planFamily: string) {
  if (planFamily === "plus") return "plan.plus_activated";
  if (planFamily === "premium") return "plan.premium_activated";
  if (planFamily === "ministry") return "plan.ministry_activated";
  return "plan.free_activated";
}

function getSpecificPlanTransitionEvent(fromSlug?: string | null, toSlug?: string | null) {
  const from = normalizePlanFamily(fromSlug);
  const to = normalizePlanFamily(toSlug);
  if (from === to) return null;

  const direction = planRank(to) > planRank(from) ? "upgrade" : "downgrade";
  const key = `${from}_to_${to}`;
  const allowed = new Set([
    "free_to_plus",
    "free_to_premium",
    "plus_to_premium",
    "plus_to_ministry",
    "premium_to_ministry",
    "premium_to_plus",
    "premium_to_free",
    "plus_to_free",
    "ministry_to_premium",
    "ministry_to_plus",
    "ministry_to_free",
  ]);

  if (!allowed.has(key)) return null;
  return `${direction}.${key}`;
}

async function dispatchCheckoutStarted(input: {
  userId: string;
  email: string;
  planSlug: string;
  planId: string;
  customerId: string;
  sessionUrl?: string | null;
  trialDays: number;
  source?: string | null;
  attribution?: Record<string, string>;
}) {
  const events = getCheckoutStartedEvents(input.planSlug);
  await Promise.allSettled(
    events.map((event) =>
      dispatchWebhookEvent({
        event: event as any,
        source: "stripe.checkout",
        recipient: {
          email: input.email,
        },
        data: {
          user_id: input.userId,
          plan: input.planSlug,
          plan_id: input.planId,
          stripe_customer_id: input.customerId,
          checkout_url: input.sessionUrl ?? null,
          trial_days: input.trialDays,
          source: input.source ?? input.attribution?.utm_source ?? null,
          attribution: input.attribution ?? {},
          started_at: new Date().toISOString(),
        },
      }),
    ),
  );
}

async function dispatchPlanTransition(input: {
  userId: string;
  email?: string | null;
  fromPlanSlug?: string | null;
  toPlanSlug: string;
  subscriptionId?: string | null;
}) {
  const fromFamily = normalizePlanFamily(input.fromPlanSlug);
  const toFamily = normalizePlanFamily(input.toPlanSlug);
  if (fromFamily === toFamily) return;

  const specificEvent = getSpecificPlanTransitionEvent(input.fromPlanSlug, input.toPlanSlug);
  const activatedEvent = getPlanActivatedEvent(toFamily);
  const events = [specificEvent, activatedEvent].filter(Boolean) as string[];

  await Promise.allSettled(
    events.map((event) =>
      dispatchWebhookEvent({
        event: event as any,
        source: "billing.plan_change",
        recipient: {
          email: input.email ?? undefined,
        },
        data: {
          user_id: input.userId,
          from_plan: input.fromPlanSlug ?? null,
          from_plan_family: fromFamily,
          to_plan: input.toPlanSlug,
          to_plan_family: toFamily,
          subscription_id: input.subscriptionId ?? null,
          changed_at: new Date().toISOString(),
        },
      }),
    ),
  );
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
  if (!planId) throw new Error("Plano obrigatório.");

  const { data: plan, error } = await supabase
    .from("plans")
    .select("id,slug,trial_days,stripe_price_id")
    .eq("id", planId)
    .single();

  if (error) throw new Error(`Falha ao buscar plano: ${error.message}`);
  if (!plan?.id || plan.slug === "free") throw new Error("Plano inválido para assinatura paga.");

  const stripePriceId = resolvePlanPriceId(plan.slug, plan.stripe_price_id);
  if (!stripePriceId) throw new Error(`Plano ${plan.slug} sem Price ID configurado no ambiente.`);

  return { ...plan, stripePriceId };
}

async function hasUsedTrial(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id,trial_ends_at,stripe_subscription_id,gateway_subscription_id")
    .eq("user_id", userId)
    .not("trial_ends_at", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao verificar uso de trial: ${error.message}`);
  }

  return Boolean(data?.id);
}

function normalizeSubscriptionValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isActiveMigratedSubscription(subscription: any) {
  if (!subscription) return false;

  const status = normalizeSubscriptionValue(subscription.status);
  const gateway = normalizeSubscriptionValue(subscription.gateway);
  const originalGateway = normalizeSubscriptionValue(subscription.original_gateway);
  const migrated = Boolean(
    subscription.migrated_from_pms ||
      subscription.legacy_pms_subscription_id ||
      ["legacy", "manual_migration", "migration", "pms"].includes(gateway) ||
      originalGateway === "pms",
  );

  return migrated && ["active", "trialing"].includes(status);
}

async function savePendingStripeSubscription(supabase: any, input: { userId: string; planId: string; customerId: string; attribution?: Record<string, string> }) {
  if (!input.planId) throw new Error("Plano obrigatório para preparar assinatura.");

  const now = new Date().toISOString();
  const payload = {
    user_id: input.userId,
    plan_id: input.planId,
    status: "pending",
    gateway: "stripe",
    stripe_customer_id: input.customerId,
    gateway_customer_id: input.customerId,
    ...pickAttribution(input.attribution),
    updated_at: now,
  };

  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("id,status,gateway,original_gateway,migrated_from_pms,legacy_pms_subscription_id")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Falha ao verificar assinatura existente: ${existingError.message}`);
  }

  if (isActiveMigratedSubscription(existing)) {
    return;
  }

  const result = existing?.id
    ? await supabase.from("subscriptions").update(payload).eq("id", existing.id)
    : await supabase.from("subscriptions").insert({ ...payload, created_at: now });

  if (result.error) {
    throw new Error(`Falha ao preparar assinatura Stripe: ${result.error.message}`);
  }
}


async function getCheckoutUserMetadata(supabase: any, userId: string, fallbackEmail: string, fallbackMetadata?: CheckoutMetadata | null) {
  const recipient = await resolveWebhookRecipientForUser(supabase, userId, {
    email: fallbackEmail,
    metadata: fallbackMetadata ?? {},
    phone: fallbackMetadata?.phone,
    full_name: fallbackMetadata?.full_name,
    username: fallbackMetadata?.username,
  });

  const fallbackFullName = String(fallbackMetadata?.full_name ?? "").trim() || undefined;
  const fallbackUsername = String(fallbackMetadata?.username ?? "").trim() || undefined;

  return {
    fullName: recipient.name ?? fallbackFullName,
    username: recipient.username ?? fallbackUsername,
    phone: normalizeWebhookPhone(recipient.phone ?? fallbackMetadata?.phone),
  };
}

async function createStripeCheckoutWithSupabase(
  supabase: any,
  userId: string,
  email: string,
  planId: string,
  fallbackOrigin?: string | null,
  metadata?: CheckoutMetadata,
) {
  assertStripeReady();

  const [{ data: existing }, plan, trialAlreadyUsed] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*, plans(slug)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getPlanById(supabase, planId),
    hasUsedTrial(supabase, userId),
  ]);

  const attribution = pickAttribution(metadata);
  const userMetadata = await getCheckoutUserMetadata(supabase, userId, email, metadata);
  const previousPlanSlug = existing?.plans?.slug ?? null;
  const customerId = await getOrCreateCustomer({
    email,
    userId,
    existingCustomerId: existing?.stripe_customer_id ?? existing?.gateway_customer_id,
  });

  await savePendingStripeSubscription(supabase, { userId, planId, customerId, attribution });

  const base = resolveAppUrl(fallbackOrigin);
  const trialDays = trialAlreadyUsed ? 0 : Number(plan.trial_days ?? 0);

  const session = await createCheckoutSession({
    customerId,
    priceId: plan.stripePriceId,
    successUrl: `${base}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/checkout/cancelado`,
    trialDays,
    metadata: {
      ...metadata,
      user_id: userId,
      email,
      phone: userMetadata.phone,
      full_name: userMetadata.fullName,
      username: userMetadata.username,
      plan_slug: plan.slug,
      previous_plan_slug: previousPlanSlug,
      trial_already_used: trialAlreadyUsed ? "true" : "false",
    },
  });

  void dispatchCheckoutStarted({
    userId,
    email,
    planSlug: plan.slug,
    planId: plan.id,
    customerId,
    sessionUrl: session?.url ?? null,
    trialDays,
    source: metadata?.source ?? attribution.utm_source ?? null,
    attribution,
  }).catch((error) => console.error("[billing] Falha ao disparar webhook checkout.started", error));

  return session;
}

export async function startStripeCheckout(userId: string, email: string, planId: string, fallbackOrigin?: string | null, metadata?: CheckoutMetadata) {
  const supabase = createSupabaseAdminClient() as any;
  return createStripeCheckoutWithSupabase(supabase, userId, email, planId, fallbackOrigin, metadata);
}

export async function startStripeCheckoutForSignup(userId: string, email: string, planSlug: string, fallbackOrigin?: string | null, metadata?: CheckoutMetadata) {
  const supabase = createSupabaseAdminClient() as any;
  const plan = await getPlanBySlug(supabase, planSlug);
  return createStripeCheckoutWithSupabase(supabase, userId, email, plan.id, fallbackOrigin, {
    source: "paid_signup",
    ...metadata,
  });
}

export async function createPortal(userId: string, email: string, fallbackOrigin?: string | null) {
  assertStripeReady();
  const supabase = createSupabaseAdminClient() as any;
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar assinatura: ${error.message}`);

  const existingCustomerId = sub?.stripe_customer_id ?? sub?.gateway_customer_id;
  if (!sub?.id || !existingCustomerId) {
    throw new Error("Você ainda não possui uma assinatura Stripe vinculada. Inicie uma assinatura primeiro.");
  }

  const customerId = await getOrCreateCustomer({
    email,
    userId,
    existingCustomerId,
  });

  return createCustomerPortalSession(customerId, `${resolveAppUrl(fallbackOrigin)}/assinatura`);
}

export async function changeSubscriptionPlan(userId: string, planId: string) {
  if (!planId) throw new Error("Plano obrigatório para alteração.");

  const supabase = createSupabaseAdminClient() as any;
  const [{ data: sub, error: subError }, plan] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*, plans:plan_id(slug)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getPlanById(supabase, planId),
  ]);

  if (subError) throw new Error(`Falha ao buscar assinatura: ${subError.message}`);
  if (!sub?.id) throw new Error("Nenhuma assinatura encontrada para este usuário.");
  if (!sub?.stripe_subscription_id) throw new Error("Assinatura inválida para upgrade/troca de plano.");
  if (sub.plan_id === planId) return;

  const previousPlanSlug = sub?.plans?.slug ?? null;

  await updateSubscription(sub.stripe_subscription_id, plan.stripePriceId);
  const { error } = await supabase
    .from("subscriptions")
    .update({ plan_id: planId, stripe_price_id: plan.stripePriceId, updated_at: new Date().toISOString() })
    .eq("id", sub.id);
  if (error) throw new Error(`Falha ao atualizar plano local: ${error.message}`);

  void dispatchPlanTransition({
    userId,
    email: sub?.email ?? null,
    fromPlanSlug: previousPlanSlug,
    toPlanSlug: plan.slug,
    subscriptionId: sub.id,
  }).catch((transitionError) => console.error("[billing] Falha ao disparar webhook de troca de plano", transitionError));
}
