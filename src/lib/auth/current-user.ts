import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type EffectivePlanSlug = "guest" | "free" | "plus" | "premium";

export interface MinistryAccessContext {
  ministryId: string;
  role: "owner" | "manager" | "member";
  seatLimit: number;
  planType: string;
}

export interface CurrentUserAccessContext {
  effectiveSlug: EffectivePlanSlug;
  profile: Profile | null;
  plan: Plan | null;
  subscription: Subscription | null;
  hierarchyLevel: number;
  isGuest: boolean;
  isAdmin: boolean;
  ministry: MinistryAccessContext | null;
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

function isSubscriptionUsable(subscription: Subscription | null | undefined) {
  if (!subscription) return false;
  const status = String(subscription.status ?? "").toLowerCase();
  if (!["active", "trialing"].includes(status)) return false;
  const periodEnd = (subscription as any).current_period_end
    ? new Date((subscription as any).current_period_end).getTime()
    : Number.POSITIVE_INFINITY;
  return periodEnd > Date.now();
}

function normalizeEffectivePlanSlug(value: unknown): EffectivePlanSlug {
  const slug = String(value ?? "").trim().toLowerCase();
  if (slug === "premium") return "premium";
  if (slug === "plus") return "plus";
  return "free";
}

export async function getCurrentUserAccessContext(): Promise<CurrentUserAccessContext> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { effectiveSlug: "guest", profile: null, plan: null, subscription: null, hierarchyLevel: 0, isGuest: true, isAdmin: false, ministry: null };

  const admin = createSupabaseAdminClient() as any;
  const [{ data: plans }, { data: subscription }, profile, { data: ministryMembership }] = await Promise.all([
    admin.from("plans").select("*"),
    admin.from("subscriptions").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    findProfileForUser(supabase, data.user),
    admin.from("ministry_members").select("role,ministry:ministries(*)").eq("user_id", data.user.id).eq("status", "active").maybeSingle(),
  ]);

  const typedSubscription = (subscription as Subscription | null) ?? null;
  const plan = (plans ?? []).find((p: Plan) => p.id === typedSubscription?.plan_id) ?? null;
  const ministryActive = ministryMembership?.ministry && ["active", "trialing"].includes(String(ministryMembership.ministry.status ?? "").toLowerCase());
  const usableSubscription = isSubscriptionUsable(typedSubscription);
  const paidPlanSlug = normalizeEffectivePlanSlug(plan?.slug);

  const effectiveSlug: EffectivePlanSlug = ministryActive
    ? "premium"
    : usableSubscription
      ? paidPlanSlug
      : "free";

  return {
    effectiveSlug,
    profile,
    plan,
    subscription: typedSubscription,
    hierarchyLevel: effectiveSlug === "premium" ? 3 : plan?.hierarchy_level ?? (effectiveSlug === "plus" ? 2 : 1),
    isGuest: false,
    isAdmin: normalizeRole(profile?.role) === "admin",
    ministry: ministryActive
      ? {
          ministryId: ministryMembership.ministry.id as string,
          role: ministryMembership.role as "owner" | "manager" | "member",
          seatLimit: Number(ministryMembership.ministry.seat_limit ?? 0),
          planType: String(ministryMembership.ministry.plan_type ?? ""),
        }
      : null,
  };
}

export async function getCurrentUserPlan() {
  return getCurrentUserAccessContext();
}
export async function getEffectiveUserPlan() { return getCurrentUserAccessContext(); }
export function isMinistryOwner(context: CurrentUserAccessContext) { return context.ministry?.role === "owner"; }
export function isMinistryManager(context: CurrentUserAccessContext) { return context.ministry?.role === "owner" || context.ministry?.role === "manager"; }
export function isMinistryMember(context: CurrentUserAccessContext) { return Boolean(context.ministry); }
