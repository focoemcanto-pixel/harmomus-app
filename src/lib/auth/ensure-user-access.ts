import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type EnsureUserAccessInput = {
  id: string;
  email?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  legacyProvider?: string | null;
  legacyUserId?: string | null;
};

function normalizeEmail(email?: string | null) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeName(input: EnsureUserAccessInput) {
  return String(input.fullName ?? "").trim() || null;
}

function normalizeRole(existingRole?: string | null) {
  const role = String(existingRole ?? "").trim().toLowerCase();
  if (role === "admin") return "admin";
  return "member";
}

async function getFreePlanId(admin: any) {
  const { data: plan, error } = await admin
    .from("plans")
    .select("id")
    .eq("slug", "free")
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar plano free: ${error.message}`);
  if (!plan?.id) throw new Error("Plano free não encontrado. Crie o plano com slug 'free' antes de migrar usuários.");

  return plan.id as string;
}

async function ensureProfile(admin: any, input: EnsureUserAccessInput) {
  const email = normalizeEmail(input.email);
  const fullName = normalizeName(input);
  const now = new Date().toISOString();

  const { data: existingProfile, error: existingError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", input.id)
    .maybeSingle();

  if (existingError) throw new Error(`Falha ao verificar perfil: ${existingError.message}`);

  const payload: Record<string, unknown> = {
    id: input.id,
    email: email || null,
    full_name: fullName,
    avatar_url: input.avatarUrl ?? null,
    role: normalizeRole(existingProfile?.role),
    updated_at: now,
  };

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

  if (error) throw new Error(`Falha ao salvar perfil: ${error.message}`);
}

async function ensureFreeSubscription(admin: any, userId: string) {
  const { data: existingSubscription, error: existingError } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw new Error(`Falha ao verificar assinatura: ${existingError.message}`);
  if (existingSubscription?.id) return;

  const freePlanId = await getFreePlanId(admin);
  const now = new Date().toISOString();

  const { error } = await admin.from("subscriptions").insert({
    user_id: userId,
    plan_id: freePlanId,
    status: "active",
    gateway: "migration",
    migrated_from_pms: false,
    original_gateway: "harmomus-free",
    imported_at: now,
    updated_at: now,
  });

  if (error) throw new Error(`Falha ao criar assinatura free: ${error.message}`);
}

export async function ensureUserAccess(input: EnsureUserAccessInput) {
  if (!input.id) throw new Error("Usuário inválido para bootstrap de acesso.");

  const admin = createSupabaseAdminClient() as any;
  await ensureProfile(admin, input);
  await ensureFreeSubscription(admin, input.id);
}
