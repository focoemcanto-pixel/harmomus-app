import "server-only";

import { getBestCustomerSubscription } from "@/lib/stripe/client";

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalize(value).toLowerCase();
}

function fromStripeTimestamp(value: unknown) {
  const seconds = Number(value ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function getStripePriceId(subscription: any) {
  return normalize(subscription?.items?.data?.[0]?.price?.id);
}

async function resolvePlan(admin: any, legacyMember: any) {
  const legacySlug = normalizeLower(legacyMember?.legacy_plan_slug);
  const stripeCustomerId = normalize(legacyMember?.stripe_customer_id);
  let stripeSubscription: any | null = null;
  let stripePriceId: string | null = null;

  if (stripeCustomerId) {
    try {
      const candidate = await getBestCustomerSubscription(stripeCustomerId);
      const status = normalizeLower(candidate?.status);
      const candidatePriceId = getStripePriceId(candidate);
      if (candidate?.id && ["active", "trialing", "past_due"].includes(status) && candidatePriceId) {
        const { data: mappedPlan } = await admin
          .from("plans")
          .select("id,slug,stripe_price_id")
          .eq("stripe_price_id", candidatePriceId)
          .maybeSingle();
        if (mappedPlan?.id) {
          stripeSubscription = candidate;
          stripePriceId = candidatePriceId;
          return { plan: mappedPlan, stripeSubscription, stripePriceId };
        }
      }
    } catch (error) {
      console.warn("[migration.finalize] falha ao consultar Stripe; usando plano legado", error);
    }
  }

  if (!legacySlug) throw new Error("Plano legado ausente.");
  const { data: plan, error } = await admin
    .from("plans")
    .select("id,slug,stripe_price_id")
    .eq("slug", legacySlug)
    .maybeSingle();
  if (error || !plan?.id) throw new Error("Plano legado não está mapeado.");
  return { plan, stripeSubscription, stripePriceId };
}

async function upsertSubscription(admin: any, input: {
  userId: string;
  planId: string;
  legacyMember: any;
  stripeSubscription: any | null;
  stripePriceId: string | null;
  now: string;
}) {
  const stripeCustomerId = normalize(input.legacyMember?.stripe_customer_id) || null;
  const stripeSubscriptionId = input.stripeSubscription?.id ? String(input.stripeSubscription.id) : null;
  const status = input.stripeSubscription ? normalizeLower(input.stripeSubscription.status) || "unknown" : "active";
  const currentPeriodEnd = input.stripeSubscription ? fromStripeTimestamp(input.stripeSubscription.current_period_end) : null;
  const cancelAtPeriodEnd = input.stripeSubscription ? Boolean(input.stripeSubscription.cancel_at_period_end) : false;

  const payload = {
    user_id: input.userId,
    plan_id: input.planId,
    status,
    starts_at: input.stripeSubscription ? fromStripeTimestamp(input.stripeSubscription.start_date) : input.now,
    current_period_end: currentPeriodEnd,
    next_billing_at: currentPeriodEnd,
    trial_ends_at: input.stripeSubscription ? fromStripeTimestamp(input.stripeSubscription.trial_end) : null,
    auto_renew: !cancelAtPeriodEnd,
    gateway: input.stripeSubscription ? "stripe" : "legacy",
    gateway_customer_id: input.stripeSubscription ? stripeCustomerId : null,
    gateway_subscription_id: stripeSubscriptionId,
    legacy_pms_subscription_id: input.legacyMember?.legacy_subscription_id ? String(input.legacyMember.legacy_subscription_id) : null,
    migrated_from_pms: true,
    original_gateway: input.legacyMember?.legacy_gateway ?? "pms",
    cancel_at_period_end: cancelAtPeriodEnd,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    stripe_price_id: input.stripePriceId,
    last_webhook_event: "legacy_migration_password_verified",
    imported_at: input.now,
    updated_at: input.now,
  };

  const { data: existing, error: lookupError } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error("Falha ao verificar assinatura migrada.");

  const result = existing?.id
    ? await admin.from("subscriptions").update(payload).eq("id", existing.id)
    : await admin.from("subscriptions").insert({ ...payload, created_at: input.now });
  if (result.error) throw new Error("Falha ao salvar assinatura migrada.");
}

export async function finalizeLegacyMigration(admin: any, input: { userId: string; email: string }) {
  const email = normalizeLower(input.email);
  if (!input.userId || !email) throw new Error("Usuário migrado inválido.");

  const { data: legacyMember, error: legacyError } = await admin
    .from("legacy_members")
    .select("id,legacy_subscription_id,email,display_name,legacy_plan_slug,legacy_status,legacy_gateway,billing_amount,migrated,password_created,stripe_customer_id")
    .ilike("email", email)
    .maybeSingle();
  if (legacyError || !legacyMember) throw new Error("Conta migrada não encontrada.");
  if (normalizeLower(legacyMember.legacy_status) !== "active") throw new Error("Conta migrada inativa.");

  const now = new Date().toISOString();
  const { plan, stripeSubscription, stripePriceId } = await resolvePlan(admin, legacyMember);

  const { error: profileError } = await admin.from("profiles").upsert({
    id: input.userId,
    email,
    full_name: legacyMember.display_name ?? null,
    role: "member",
    migrated_from_pms: true,
    requires_password_setup: false,
    password_setup_completed_at: now,
    updated_at: now,
  }, { onConflict: "id" });
  if (profileError) throw new Error("Falha ao finalizar perfil migrado.");

  await upsertSubscription(admin, {
    userId: input.userId,
    planId: plan.id,
    legacyMember,
    stripeSubscription,
    stripePriceId,
    now,
  });

  const legacyUpdate: Record<string, unknown> = {
    migrated: true,
    password_created: true,
    supabase_user_id: input.userId,
    migrated_at: now,
    legacy_plan_slug: plan.slug,
  };
  if (stripeSubscription?.id) {
    legacyUpdate.stripe_synced_at = now;
    legacyUpdate.stripe_subscription_id = String(stripeSubscription.id);
    legacyUpdate.stripe_price_id = stripePriceId;
    legacyUpdate.stripe_status = normalizeLower(stripeSubscription.status) || "unknown";
    legacyUpdate.stripe_current_period_end = fromStripeTimestamp(stripeSubscription.current_period_end);
    legacyUpdate.billing_amount = plan.slug === "premium" ? 39.9 : plan.slug === "plus" ? 19.9 : legacyMember.billing_amount ?? 0;
  }

  const { error: legacyUpdateError } = await admin
    .from("legacy_members")
    .update(legacyUpdate)
    .eq("id", legacyMember.id);
  if (legacyUpdateError) throw new Error("Falha ao concluir registro legado.");

  return { profileEmail: email, planSlug: plan.slug };
}
