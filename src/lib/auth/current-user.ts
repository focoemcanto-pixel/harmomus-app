import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ensureMinistryForSubscription,
  getMinistrySeatLimit,
  isMinistryPlanSlug,
} from "@/lib/data/ministry";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type EffectivePlanSlug = "guest" | "free" | "plus" | "premium";

export interface MinistryAccessContext {
  ministryId: string;
  role: "owner" | "admin" | "manager" | "member";
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
  return String(role ?? "")
    .trim()
    .toLowerCase();
}

function isPlatformAdminRole(role: unknown) {
  const normalized = normalizeRole(role);
  return normalized === "owner" || normalized === "admin";
}

async function findProfileForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string | null },
) {
  const { data: profileById } = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (profileById) return profileById as Profile;
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;
  const { data: profileByEmail } = await (supabase as any)
    .from("profiles")
    .select("*")
    .ilike("email", email)
    .maybeSingle();
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

function hasBillingLink(subscription: Subscription | null | undefined) {
  if (!subscription) return false;

  const stripeSubscriptionId = (subscription as any).stripe_subscription_id;
  const stripeCustomerId = (subscription as any).stripe_customer_id;
  const gatewaySubscriptionId = (subscription as any).gateway_subscription_id;
  const gatewayCustomerId = (subscription as any).gateway_customer_id;

  return Boolean(
    (stripeSubscriptionId && stripeCustomerId) ||
    (gatewaySubscriptionId && gatewayCustomerId),
  );
}

function isLegacyPmsSubscription(subscription: Subscription | null | undefined) {
  if (!subscription) return false;
  const gateway = String((subscription as any).gateway ?? "").trim().toLowerCase();
  const originalGateway = String((subscription as any).original_gateway ?? "").trim().toLowerCase();
  return Boolean(
    (subscription as any).migrated_from_pms === true ||
    gateway === "legacy" ||
    gateway === "pms" ||
    originalGateway === "pms",
  );
}

const OVERDUE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

function isSubscriptionUsable(
  subscription: Subscription | null | undefined,
  planSlug?: string | null,
) {
  if (!subscription) return false;
  const status = String(subscription.status ?? "").toLowerCase();
  if (!["active", "trialing", "overdue"].includes(status)) return false;

  const isLegacyPms = isLegacyPmsSubscription(subscription);
  if (
    (planSlug === "premium" || isMinistryPlanSlug(planSlug)) &&
    !hasBillingLink(subscription) &&
    !isLegacyPms
  ) {
    return false;
  }

  const periodEnd = (subscription as any).current_period_end
    ? new Date((subscription as any).current_period_end).getTime()
    : Number.POSITIVE_INFINITY;
  const accessUntil = status === "overdue" ? periodEnd + OVERDUE_GRACE_PERIOD_MS : periodEnd;
  return accessUntil > Date.now();
}

function normalizeEffectivePlanSlug(value: unknown): EffectivePlanSlug {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase();
  if (slug === "premium" || isMinistryPlanSlug(slug)) return "premium";
  if (slug === "plus") return "plus";
  return "free";
}

function buildMinistryContextFromRows(
  membership: any,
  ministry: any,
): MinistryAccessContext | null {
  const ministryActive =
    ministry &&
    ["active", "trialing"].includes(
      String(ministry.status ?? "").toLowerCase(),
    );
  if (!membership || !ministryActive) return null;

  const planType = String(ministry.plan_type ?? "");
  const seatLimit =
    Number(ministry.seat_limit ?? 0) || getMinistrySeatLimit(planType);

  return {
    ministryId: ministry.id as string,
    role: membership.role as "owner" | "admin" | "manager" | "member",
    seatLimit,
    planType,
  };
}

async function getActiveMinistryMembership(admin: any, userId: string) {
  const { data: memberships } = await admin
    .from("ministry_members")
    .select("id,ministry_id,role,status,created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(10);

  for (const membership of memberships ?? []) {
    if (!membership?.ministry_id) continue;

    const { data: ministry } = await admin
      .from("ministries")
      .select("id,status,seat_limit,plan_type,created_at")
      .eq("id", membership.ministry_id)
      .maybeSingle();

    if (
      ministry &&
      ["active", "trialing"].includes(
        String(ministry.status ?? "").toLowerCase(),
      )
    ) {
      return { ...membership, ministry };
    }
  }

  return null;
}

export async function getCurrentUserAccessContext(): Promise<CurrentUserAccessContext> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user)
    return {
      effectiveSlug: "guest",
      profile: null,
      plan: null,
      subscription: null,
      hierarchyLevel: 0,
      isGuest: true,
      isAdmin: false,
      ministry: null,
    };

  const admin = createSupabaseAdminClient() as any;
  const [{ data: plans }, { data: subscription }, profile] = await Promise.all([
    admin.from("plans").select("*"),
    admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", data.user.id)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    findProfileForUser(supabase, data.user),
  ]);

  const typedSubscription = (subscription as Subscription | null) ?? null;
  const plan =
    (plans ?? []).find((p: Plan) => p.id === typedSubscription?.plan_id) ??
    null;
  const rawPlanSlug = String(plan?.slug ?? "")
    .trim()
    .toLowerCase();
  const paidPlanSlug = normalizeEffectivePlanSlug(rawPlanSlug);
  const usableSubscription = isSubscriptionUsable(
    typedSubscription,
    rawPlanSlug,
  );

  let ministryMembership = await getActiveMinistryMembership(
    admin,
    data.user.id,
  );
  let ministryContext = buildMinistryContextFromRows(
    ministryMembership,
    ministryMembership?.ministry,
  );

  if (
    !ministryContext &&
    usableSubscription &&
    isMinistryPlanSlug(rawPlanSlug)
  ) {
    await ensureMinistryForSubscription({
      userId: data.user.id,
      planSlug: rawPlanSlug,
      subscriptionId: typedSubscription?.id ?? null,
      stripeCustomerId:
        (typedSubscription as any)?.stripe_customer_id ??
        (typedSubscription as any)?.gateway_customer_id ??
        null,
      stripeSubscriptionId:
        (typedSubscription as any)?.stripe_subscription_id ??
        (typedSubscription as any)?.gateway_subscription_id ??
        null,
      status: typedSubscription?.status ?? null,
      currentPeriodEnd: (typedSubscription as any)?.current_period_end ?? null,
      trialEndsAt: (typedSubscription as any)?.trial_ends_at ?? null,
    });

    ministryMembership = await getActiveMinistryMembership(admin, data.user.id);
    ministryContext = buildMinistryContextFromRows(
      ministryMembership,
      ministryMembership?.ministry,
    );
  }

  const effectiveSlug: EffectivePlanSlug = ministryContext
    ? "premium"
    : usableSubscription
      ? paidPlanSlug
      : "free";

  return {
    effectiveSlug,
    profile,
    plan,
    subscription: typedSubscription,
    hierarchyLevel:
      effectiveSlug === "premium" ? 3 : effectiveSlug === "plus" ? 2 : 1,
    isGuest: false,
    isAdmin: isPlatformAdminRole(profile?.role),
    ministry: ministryContext,
  };
}

export async function getCurrentUserPlan() {
  return getCurrentUserAccessContext();
}
export async function getEffectiveUserPlan() {
  return getCurrentUserAccessContext();
}
export function isMinistryOwner(context: CurrentUserAccessContext) {
  return context.ministry?.role === "owner";
}
export function isMinistryManager(context: CurrentUserAccessContext) {
  return (
    context.ministry?.role === "owner" ||
    context.ministry?.role === "admin" ||
    context.ministry?.role === "manager"
  );
}
export function isMinistryMember(context: CurrentUserAccessContext) {
  return Boolean(context.ministry);
}
