import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getBestCustomerSubscription } from "@/lib/stripe/client";

function redirectToMigrationPage(request: Request, email: string, error?: string) {
  const url = new URL("/definir-senha-migrada", request.url);
  url.searchParams.set("email", email);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

function redirectToVerificationPage(request: Request, email: string) {
  const url = new URL("/cadastro/verifique-email", request.url);
  url.searchParams.set("migration", "1");
  url.searchParams.set("email", email);
  return NextResponse.redirect(url, 303);
}

function fromStripeTimestamp(value: unknown) {
  const seconds = Number(value ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function normalizeStripeStatus(value: unknown) {
  const status = String(value ?? "").trim().toLowerCase();
  return status || "unknown";
}

function getStripePriceId(subscription: any) {
  return String(subscription?.items?.data?.[0]?.price?.id ?? "").trim();
}

function normalizeLegacyPlanSlug(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function resolvePlanBySlug(admin: any, slug: string) {
  if (!slug) throw new Error("Plano legado ausente em legacy_members.legacy_plan_slug.");

  const { data: plan, error } = await admin
    .from("plans")
    .select("id,slug,stripe_price_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Erro ao localizar plano legado ${slug}:${error.message}`);
  if (!plan?.id) throw new Error(`Plano legado ${slug} não está mapeado na tabela plans.slug.`);
  return plan;
}

function logLegacyPlanFallback(legacyMember: any, reason: string, details?: Record<string, unknown>) {
  console.warn("[migration] fallback legacy plan", {
    legacyMemberId: legacyMember?.id ?? null,
    email: legacyMember?.email ?? null,
    legacyPlanSlug: normalizeLegacyPlanSlug(legacyMember?.legacy_plan_slug),
    stripeCustomerId: String(legacyMember?.stripe_customer_id ?? "").trim() || null,
    reason,
    ...(details ?? {}),
  });
}

async function resolvePlanFromLegacySlug(admin: any, legacyMember: any, reason: string, details?: Record<string, unknown>) {
  logLegacyPlanFallback(legacyMember, reason, details);
  const legacyPlanSlug = normalizeLegacyPlanSlug(legacyMember?.legacy_plan_slug);
  const plan = await resolvePlanBySlug(admin, legacyPlanSlug);
  return { plan, stripeSubscription: null, stripePriceId: null };
}

async function resolveLegacyPlan(admin: any, legacyMember: any) {
  const stripeCustomerId = String(legacyMember?.stripe_customer_id ?? "").trim();

  if (!stripeCustomerId) {
    return resolvePlanFromLegacySlug(admin, legacyMember, "missing_stripe_customer_id");
  }

  let stripeSubscription: any | null = null;

  try {
    stripeSubscription = await getBestCustomerSubscription(stripeCustomerId);
  } catch (error) {
    return resolvePlanFromLegacySlug(admin, legacyMember, "stripe_api_error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!stripeSubscription?.id) {
    return resolvePlanFromLegacySlug(admin, legacyMember, "stripe_subscription_not_found");
  }

  const stripeStatus = normalizeStripeStatus(stripeSubscription.status);
  if (!["active", "trialing", "past_due"].includes(stripeStatus)) {
    return resolvePlanFromLegacySlug(admin, legacyMember, "stripe_subscription_not_usable", {
      stripeSubscriptionId: stripeSubscription.id,
      stripeStatus,
    });
  }

  const stripePriceId = getStripePriceId(stripeSubscription);
  if (!stripePriceId) {
    return resolvePlanFromLegacySlug(admin, legacyMember, "stripe_price_id_missing", {
      stripeSubscriptionId: stripeSubscription.id,
      stripeStatus,
    });
  }

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("id,slug,stripe_price_id")
    .eq("stripe_price_id", stripePriceId)
    .maybeSingle();

  if (planError) {
    return resolvePlanFromLegacySlug(admin, legacyMember, "stripe_price_plan_lookup_error", {
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId,
      error: planError.message,
    });
  }

  if (!plan?.id) {
    return resolvePlanFromLegacySlug(admin, legacyMember, "stripe_price_not_mapped", {
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId,
    });
  }

  return { plan, stripeSubscription, stripePriceId };
}

async function upsertLegacySubscription(admin: any, input: {
  userId: string;
  planId: string;
  legacyMember: any;
  stripeSubscription: any | null;
  stripePriceId: string | null;
  now: string;
}) {
  const stripeCustomerId = String(input.legacyMember?.stripe_customer_id ?? "").trim() || null;
  const stripeSubscriptionId = input.stripeSubscription?.id ? String(input.stripeSubscription.id) : null;
  const stripeStatus = input.stripeSubscription ? normalizeStripeStatus(input.stripeSubscription.status) : "active";
  const currentPeriodEnd = input.stripeSubscription ? fromStripeTimestamp(input.stripeSubscription.current_period_end) : null;
  const trialEndsAt = input.stripeSubscription ? fromStripeTimestamp(input.stripeSubscription.trial_end) : null;
  const cancelAtPeriodEnd = input.stripeSubscription ? Boolean(input.stripeSubscription.cancel_at_period_end) : false;

  const payload = {
    user_id: input.userId,
    plan_id: input.planId,
    status: stripeStatus,
    starts_at: input.stripeSubscription ? fromStripeTimestamp(input.stripeSubscription.start_date) : input.now,
    current_period_end: currentPeriodEnd,
    next_billing_at: currentPeriodEnd,
    trial_ends_at: trialEndsAt,
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
    last_webhook_event: "legacy_migration_password_setup",
    imported_at: input.now,
    updated_at: input.now,
  };

  const { data: existing, error: subscriptionLookupError } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionLookupError) throw new Error(`Erro ao verificar assinatura:${subscriptionLookupError.message}`);

  const result = existing?.id
    ? await admin.from("subscriptions").update(payload).eq("id", existing.id)
    : await admin.from("subscriptions").insert({ ...payload, created_at: input.now });

  if (result.error) {
    throw new Error(existing?.id ? `Erro ao atualizar assinatura:${result.error.message}` : `Erro ao criar assinatura:${result.error.message}`);
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!(email && email.includes("@"))) {
    return redirectToMigrationPage(request, email, "E-mail inválido");
  }

  const admin = createSupabaseAdminClient() as any;
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: existingProfile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id,email")
    .ilike("email", email)
    .maybeSingle();

  if (profileLookupError) {
    return redirectToMigrationPage(request, email, `Erro ao verificar perfil:${profileLookupError.message}`);
  }

  const { data: legacyMember, error: legacyLookupError } = await admin
    .from("legacy_members")
    .select("id,legacy_subscription_id,email,display_name,legacy_plan_slug,legacy_status,legacy_gateway,billing_amount,migrated,password_created,stripe_customer_id")
    .ilike("email", email)
    .maybeSingle();

  if (legacyLookupError) {
    return redirectToMigrationPage(request, email, `Erro ao verificar conta migrada:${legacyLookupError.message}`);
  }

  const eligible =
    !!legacyMember &&
    String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
    (!legacyMember.migrated || !legacyMember.password_created);

  if (!eligible) {
    return redirectToMigrationPage(request, email, "Conta migrada não encontrada ou já ativada");
  }

  let resolvedUserId = String(existingProfile?.id ?? "");

  if (!resolvedUserId) {
    let page = 1;
    const perPage = 200;

    while (!resolvedUserId) {
      const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
      if (listError) return redirectToMigrationPage(request, email, `Erro ao verificar usuário:${listError.message}`);

      const users = usersData?.users ?? [];
      const existingUser = users.find((user: any) => String(user.email ?? "").toLowerCase() === email);
      resolvedUserId = String(existingUser?.id ?? "");

      if (resolvedUserId || users.length < perPage) break;
      page += 1;
    }
  }

  if (!resolvedUserId) {
    const { data: createdData, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: legacyMember.display_name ?? "" },
    });

    if (createError) {
      return redirectToMigrationPage(request, email, `Erro ao criar usuário:${createError.message}`);
    }

    resolvedUserId = String(createdData.user?.id ?? "");
  }

  if (!resolvedUserId) {
    return redirectToMigrationPage(request, email, "Erro ao criar usuário: ID ausente");
  }

  let resolvedPlan: any;
  let stripeSubscription: any | null = null;
  let stripePriceId: string | null = null;

  try {
    const result = await resolveLegacyPlan(admin, legacyMember);
    resolvedPlan = result.plan;
    stripeSubscription = result.stripeSubscription;
    stripePriceId = result.stripePriceId;
  } catch (error) {
    return redirectToMigrationPage(request, email, error instanceof Error ? error.message : "Erro ao resolver plano migrado.");
  }

  const { error: profileUpsertError } = await admin.from("profiles").upsert(
    {
      id: resolvedUserId,
      email,
      full_name: legacyMember.display_name ?? null,
      role: "member",
      migrated_from_pms: true,
      requires_password_setup: true,
      updated_at: now,
    },
    { onConflict: "id" },
  );

  if (profileUpsertError) {
    return redirectToMigrationPage(request, email, `Erro ao preparar perfil:${profileUpsertError.message}`);
  }

  try {
    await upsertLegacySubscription(admin, {
      userId: resolvedUserId,
      planId: resolvedPlan.id,
      legacyMember,
      stripeSubscription,
      stripePriceId,
      now,
    });
  } catch (error) {
    return redirectToMigrationPage(request, email, error instanceof Error ? error.message : "Erro ao preparar assinatura migrada.");
  }

  const origin = new URL(request.url).origin;
  const callbackUrl = new URL("/auth/confirm/callback", origin);
  callbackUrl.searchParams.set("type", "recovery");
  callbackUrl.searchParams.set("next", "/redefinir-senha?migration=1");

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });

  if (resetError) {
    return redirectToMigrationPage(request, email, `Erro ao enviar e-mail:${resetError.message}`);
  }

  const legacyUpdatePayload: Record<string, unknown> = {
    migrated: true,
    supabase_user_id: resolvedUserId,
    migrated_at: now,
    legacy_plan_slug: resolvedPlan.slug,
  };

  if (stripeSubscription?.id) {
    legacyUpdatePayload.stripe_synced_at = now;
    legacyUpdatePayload.stripe_subscription_id = String(stripeSubscription.id);
    legacyUpdatePayload.stripe_price_id = stripePriceId;
    legacyUpdatePayload.stripe_status = normalizeStripeStatus(stripeSubscription.status);
    legacyUpdatePayload.stripe_current_period_end = fromStripeTimestamp(stripeSubscription.current_period_end);
    legacyUpdatePayload.billing_amount = resolvedPlan.slug === "premium" ? 39.9 : resolvedPlan.slug === "plus" ? 19.9 : legacyMember.billing_amount ?? 0;
  }

  const { error: updateLegacyError } = await admin
    .from("legacy_members")
    .update(legacyUpdatePayload)
    .ilike("email", email);

  if (updateLegacyError) {
    return redirectToMigrationPage(request, email, `Erro ao atualizar legado:${updateLegacyError.message}`);
  }

  return redirectToVerificationPage(request, email);
}
