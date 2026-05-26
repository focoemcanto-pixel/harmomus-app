import { createClient as createSupabaseSessionClient } from "@/lib/supabase/server";
import { mapStripeStatus } from "@/lib/stripe/status";
import type { Database } from "@/types/database";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

type ImportStatus = "active" | "overdue" | "canceled" | "expired" | "pending";

export type LegacyImportInput = {
  email: string;
  name?: string;
  plan: string;
  status: ImportStatus;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  next_billing_at?: string | null;
};

export type MigrationMode = "stripe" | "manual";
type ImportResult = { status: "importado" | "conflito" | "invalido"; message: string; mode: MigrationMode };

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin indisponível para migração");
  return createSupabaseAdmin(url, key, { auth: { persistSession: false } }) as any;
}

async function logMigration(email: string, status: Database["public"]["Tables"]["migration_logs"]["Row"]["status"], details: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("migration_logs").insert({ email, status, details });
}

export async function resolvePlanByLegacy(legacyPlan: string) {
  const supabase = await createSupabaseSessionClient();
  const normalized = legacyPlan.trim().toLowerCase();
  const { data: plan } = await supabase.from("plans").select("*").or(`slug.eq.${normalized},legacy_pms_plan_id.eq.${legacyPlan}`).maybeSingle();
  if (!plan) throw new Error(`Plano legado não mapeado: ${legacyPlan}`);
  return plan;
}

export async function createOrLinkProfile(input: LegacyImportInput) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers();
  if (usersError) throw usersError;

  const existing = (usersData.users as Array<{id:string;email?:string}>).find((u) => u.email?.toLowerCase() === input.email.toLowerCase());
  if (existing) {
    await admin.from("profiles").upsert({ id: existing.id, email: input.email, full_name: input.name ?? null, role: "member", migrated_from_pms: true, migration_completed_at: now, updated_at: now }, { onConflict: "id" });
    return { userId: existing.id, created: false };
  }

  const createdUser = await admin.auth.admin.createUser({ email: input.email, email_confirm: false, user_metadata: { full_name: input.name ?? "" } });
  if (createdUser.error || !createdUser.data.user) throw new Error(createdUser.error?.message ?? "Falha ao criar usuário para migração");

  await admin.from("profiles").insert({ id: createdUser.data.user.id, email: input.email, full_name: input.name ?? null, role: "member", migrated_from_pms: true, migration_completed_at: now });
  return { userId: createdUser.data.user.id, created: true };
}

export async function syncStripeSubscription(input: LegacyImportInput) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurada");
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${input.stripe_subscription_id}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Stripe subscription inválida: ${response.status}`);
  const stripeSub = await response.json() as any;

  if (stripeSub.customer !== input.stripe_customer_id) throw new Error("Conflito entre customer_id do CSV e assinatura Stripe");

  const isoPeriodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000).toISOString() : null;
  return {
    status: mapStripeStatus(stripeSub.status),
    currentPeriodEnd: isoPeriodEnd,
    nextBillingAt: isoPeriodEnd ?? input.next_billing_at ?? null,
  };
}

export async function createManualSubscription(input: LegacyImportInput): Promise<ImportResult> {
  const plan = await resolvePlanByLegacy(input.plan);
  const { userId } = await createOrLinkProfile(input);
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  await admin.from("subscriptions").upsert({
    user_id: userId,
    plan_id: (plan as any).id,
    status: "active",
    next_billing_at: input.next_billing_at ?? null,
    gateway: "manual_migration",
    migrated_from_pms: true,
    original_gateway: "pms",
    imported_at: now,
    updated_at: now,
  }, { onConflict: "user_id" });

  await logMigration(input.email, "sincronizado", { plan: (plan as any).slug, status: "active", mode: "manual" });
  return { status: "importado" as const, message: "Usuário migrado com assinatura manual", mode: "manual" as const };
}

export async function importStripeMember(input: LegacyImportInput): Promise<ImportResult> {
  try {
    if (!input.stripe_customer_id || !input.stripe_subscription_id) {
      throw new Error("stripe_customer_id e stripe_subscription_id são obrigatórios no modo stripe");
    }

    const [plan, stripeData] = await Promise.all([resolvePlanByLegacy(input.plan), syncStripeSubscription(input)] as const);
    const { userId } = await createOrLinkProfile(input);
    const admin = createSupabaseAdminClient();

    const { data: existingSub } = await admin.from("subscriptions").select("*").eq("stripe_subscription_id", input.stripe_subscription_id).maybeSingle();
    const currentSub = existingSub as { user_id: string } | null;
    if (currentSub && currentSub.user_id !== userId) {
      await logMigration(input.email, "conflito", { reason: "subscription_already_linked", existingUserId: currentSub.user_id, userId });
      return { status: "conflito" as const, message: "Assinatura Stripe já vinculada a outro usuário", mode: "stripe" as const };
    }

    await admin.from("subscriptions").upsert({
      user_id: userId,
      plan_id: (plan as any).id,
      status: stripeData.status,
      current_period_end: stripeData.currentPeriodEnd,
      next_billing_at: stripeData.nextBillingAt,
      gateway: "stripe",
      gateway_customer_id: input.stripe_customer_id,
      gateway_subscription_id: input.stripe_subscription_id,
      stripe_customer_id: input.stripe_customer_id,
      stripe_subscription_id: input.stripe_subscription_id,
      migrated_from_pms: true,
      original_gateway: "stripe+pms",
      imported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    await logMigration(input.email, "sincronizado", { plan: (plan as any).slug, subscriptionId: input.stripe_subscription_id, status: stripeData.status });
    return { status: "importado" as const, message: "Usuário migrado e assinatura sincronizada", mode: "stripe" as const };
  } catch (error) {
    await logMigration(input.email, "erro", { message: error instanceof Error ? error.message : "Erro inesperado" });
    return { status: "invalido" as const, message: error instanceof Error ? error.message : "Erro inesperado", mode: "stripe" as const };
  }
}

export async function importMember(input: LegacyImportInput): Promise<ImportResult> {
  const mode: MigrationMode = input.stripe_customer_id && input.stripe_subscription_id ? "stripe" : "manual";

  if (mode === "stripe") {
    return importStripeMember(input);
  }

  try {
    return await createManualSubscription(input);
  } catch (error) {
    await logMigration(input.email, "erro", { message: error instanceof Error ? error.message : "Erro inesperado", mode: "manual" });
    return { status: "invalido" as const, message: error instanceof Error ? error.message : "Erro inesperado", mode: "manual" as const };
  }
}
