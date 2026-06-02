import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeWebhookPhone } from "@/lib/webhooks/recipient";

export type EnsureUserAccessInput = {
  id: string;
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  legacyProvider?: string | null;
  legacyUserId?: string | null;
  selectedPlanSlug?: string | null;
};

function normalizeEmail(email?: string | null) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeName(input: EnsureUserAccessInput) {
  return String(input.fullName ?? "").trim() || null;
}

function normalizePhone(value?: string | null) {
  return normalizeWebhookPhone(value);
}

function normalizeRole(existingRole?: string | null) {
  const role = String(existingRole ?? "").trim().toLowerCase();
  if (role === "admin") return "admin";
  return "member";
}

function normalizeSelectedPlanSlug(value?: string | null) {
  return String(value ?? "free").trim().toLowerCase() || "free";
}

function isPaidPlan(slug: string) {
  return slug !== "free";
}

function isProtectedStripeSubscription(subscription?: Record<string, unknown> | null) {
  if (!subscription?.id) return false;

  const status = String(subscription.status ?? "").toLowerCase();
  const hasStripeSubscription = Boolean(subscription.stripe_subscription_id || subscription.gateway_subscription_id);

  return hasStripeSubscription || ["active", "trialing", "overdue"].includes(status);
}

async function getPlanIdBySlug(admin: any, slug: string) {
  const { data: plan, error } = await admin
    .from("plans")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar plano ${slug}: ${error.message}`);
  if (!plan?.id) throw new Error(`Plano ${slug} não encontrado.`);

  return plan.id as string;
}

async function getAuthUserMetadata(admin: any, userId: string) {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) {
      console.warn("[ensureUserAccess] Falha ao buscar metadata do usuário", error);
      return {} as Record<string, unknown>;
    }
    return (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
  } catch (error) {
    console.warn("[ensureUserAccess] Erro inesperado ao buscar metadata do usuário", error);
    return {} as Record<string, unknown>;
  }
}

async function ensureProfile(admin: any, input: EnsureUserAccessInput) {
  const metadata = await getAuthUserMetadata(admin, input.id);
  const metadataPhone = typeof metadata.phone === "string" ? metadata.phone : null;
  const metadataName = typeof metadata.full_name === "string" ? metadata.full_name : null;
  const metadataAvatar = typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;
  const email = normalizeEmail(input.email);
  const fullName = normalizeName(input) ?? (metadataName?.trim() || null);
  const phone = normalizePhone(input.phone) ?? normalizePhone(metadataPhone);
  const avatarUrl = String(input.avatarUrl ?? metadataAvatar ?? "").trim() || null;
  const now = new Date().toISOString();

  const { data: existingProfile, error: existingError } = await admin
    .from("profiles")
    .select("id, email, full_name, phone, avatar_url, role, onboarding_status, onboarding_step")
    .eq("id", input.id)
    .maybeSingle();

  if (existingError) throw new Error(`Falha ao verificar perfil: ${existingError.message}`);

  if (!existingProfile?.id && email) {
    const { data: emailProfile, error: emailError } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (emailError) throw new Error(`Falha ao verificar e-mail do perfil: ${emailError.message}`);

    if (emailProfile?.id && emailProfile.id !== input.id) {
      throw new Error("Este e-mail já possui uma conta no Harmomus. Entre com este e-mail para aceitar o convite ou recupere sua senha.");
    }
  }

  const payload: Record<string, unknown> = {
    id: input.id,
    email: email || existingProfile?.email || null,
    full_name: fullName ?? existingProfile?.full_name ?? null,
    phone: phone ?? existingProfile?.phone ?? null,
    avatar_url: avatarUrl ?? existingProfile?.avatar_url ?? null,
    role: normalizeRole(existingProfile?.role),
    updated_at: now,
  };

  if (!existingProfile?.id) {
    payload.onboarding_status = "pending_email_confirmation";
    payload.onboarding_step = "signup_started";
  }

  if (isPaidPlan(normalizeSelectedPlanSlug(input.selectedPlanSlug))) {
    payload.onboarding_status = "pending_email_confirmation";
    payload.onboarding_step = "checkout_started";
  }

  if (input.legacyProvider) {
    payload.migrated_from_pms = input.legacyProvider === "pms";
    payload.migrated_from = input.legacyProvider;
    payload.migration_completed_at = now;
  }

  if (input.legacyUserId) {
    payload.legacy_pms_member_id = input.legacyUserId;
    payload.legacy_user_id = input.legacyUserId;
  }

  const { error } = await admin
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("profiles_email_key") || message.toLowerCase().includes("duplicate key")) {
      throw new Error("Este e-mail já possui uma conta no Harmomus. Entre com este e-mail para aceitar o convite ou recupere sua senha.");
    }
    throw new Error(`Falha ao salvar perfil: ${message}`);
  }
}

async function ensureSubscription(admin: any, userId: string, selectedPlanSlug: string) {
  const { data: existingSubscription, error: existingError } = await admin
    .from("subscriptions")
    .select("id,status,stripe_subscription_id,gateway_subscription_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(`Falha ao verificar assinatura: ${existingError.message}`);

  if (isProtectedStripeSubscription(existingSubscription)) {
    return;
  }

  const planId = await getPlanIdBySlug(admin, selectedPlanSlug);
  const now = new Date().toISOString();
  const status = isPaidPlan(selectedPlanSlug) ? "pending" : "active";

  const payload = {
    user_id: userId,
    plan_id: planId,
    status,
    gateway: isPaidPlan(selectedPlanSlug) ? "stripe" : "migration",
    migrated_from_pms: false,
    original_gateway: isPaidPlan(selectedPlanSlug) ? "stripe-pending-checkout" : "harmomus-free",
    imported_at: now,
    updated_at: now,
  };

  const query = existingSubscription?.id
    ? admin.from("subscriptions").update(payload).eq("id", existingSubscription.id)
    : admin.from("subscriptions").insert(payload);

  const { error } = await query;
  if (error) throw new Error(`Falha ao preparar assinatura: ${error.message}`);
}

export async function ensureUserAccess(input: EnsureUserAccessInput) {
  if (!input.id) throw new Error("Usuário inválido para bootstrap de acesso.");

  const admin = createSupabaseAdminClient() as any;
  const selectedPlanSlug = normalizeSelectedPlanSlug(input.selectedPlanSlug);

  await ensureProfile(admin, input);
  await ensureSubscription(admin, input.id, selectedPlanSlug);
}
