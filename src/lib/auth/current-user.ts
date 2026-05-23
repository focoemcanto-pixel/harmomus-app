import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type EffectivePlanSlug = "guest" | "free" | "plus" | "premium";

export interface CurrentUserAccessContext {
  effectiveSlug: EffectivePlanSlug;
  profile: Profile | null;
  plan: Plan | null;
  subscription: Subscription | null;
  hierarchyLevel: number;
  isGuest: boolean;
  isAdmin: boolean;
}

function normalizeRole(role: unknown) {
  return String(role ?? "").trim().toLowerCase();
}

async function findProfileForUser(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string; email?: string | null }) {
  const { data: profileById } = await (supabase as any).from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (profileById) return profileById as Profile;

  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  const { data: profileByEmail } = await (supabase as any).from("profiles").select("*").ilike("email", email).maybeSingle();
  return (profileByEmail as Profile | null) ?? null;
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return await findProfileForUser(supabase, data.user);
}

export async function getCurrentUserPlan() {
  const context = await getCurrentUserAccessContext();
  return {
    effectiveSlug: context.effectiveSlug,
    profile: context.profile,
    plan: context.plan,
    subscription: context.subscription,
  };
}

function isSubscriptionUsable(subscription: Subscription | null | undefined) {
  if (!subscription) return false;
  const status = String(subscription.status ?? "").toLowerCase();
  if (!["active", "trialing"].includes(status)) return false;
  const periodEnd = (subscription as any).current_period_end ? new Date((subscription as any).current_period_end).getTime() : Number.POSITIVE_INFINITY;
  return periodEnd > Date.now();
}

export async function getCurrentUserAccessContext(): Promise<CurrentUserAccessContext> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return { effectiveSlug: "guest", profile: null, plan: null, subscription: null, hierarchyLevel: 0, isGuest: true, isAdmin: false };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const [{ data: plans }, { data: subscription }, profile] = await Promise.all([
    (supabaseAdmin as any).from("plans").select("*"),
    (supabaseAdmin as any).from("subscriptions").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    findProfileForUser(supabase, data.user),
  ]);

  const typedSubscription = (subscription as Subscription | null) ?? null;
  const plan = (plans ?? []).find((p: Plan) => p.id === typedSubscription?.plan_id) ?? null;
  const active = isSubscriptionUsable(typedSubscription);
  const effectiveSlug: EffectivePlanSlug = active ? ((plan?.slug as EffectivePlanSlug | undefined) ?? "free") : "free";
  const hierarchyLevel = plan?.hierarchy_level ?? (effectiveSlug === "premium" ? 3 : effectiveSlug === "plus" ? 2 : 1);

  return {
    effectiveSlug,
    profile,
    plan,
    subscription: typedSubscription,
    hierarchyLevel,
    isGuest: false,
    isAdmin: normalizeRole(profile?.role) === "admin",
  };
}
