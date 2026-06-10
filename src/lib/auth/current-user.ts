import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ensureMinistryForSubscription,
  getMinistrySeatLimit,
  isMinistryPlanSlug,
} from "@/lib/data/ministry";
import { resolveEffectivePlan, isActiveSubscriptionStatus } from "@/lib/access/subscription-plan";
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

function isSubscriptionUsable(
  subscription: Subscription | null | undefined,
  planSlug?: string | null,
) {
  if (!subscription) return false;
  const status = String(subscription.status ?? "").toLowerCase();
  const effectivePlan = resolveEffectivePlan({ subscription: subscription as any, planSlug });
  if (effectivePlan === "free") return false;

  const isLegacyPms = isLegacyPmsSubscription(subscription);
  if (
    (planSlug === "premium" || isMinistryPlanSlug(planSlug)) &&
    !hasBillingLink(subscription) &&
    !isLegacyPms
  ) {
    return false;
  }

  return true;
}

function normalizeEffectivePlanSlug(value: unknown): EffectivePlanSlug {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase();
  if (slug === "premium" || isMinistryPlanSlug(slug)) return "premium";
  if (slug === "plus") return "plus";
  return "free";
}

function planForSubscription(plans: Plan[] | null | undefined, subscription: Subscription | null | undefined) {
  return (plans ?? []).find((p: Plan) => p.id === subscription?.plan_id) ?? null;
}

function planSlugForSubscription(plans: Plan[] | null | undefined, subscription: Subscription | null | undefined) {
  return String(planForSubscription(plans, subscription)?.slug ?? "").trim().toLowerCase();
}

function subscriptionRank(subscription: Subscription, plans: Plan[] | null | undefined) {
  const slug = planSlugForSubscription(plans, subscription);
  const status = String(subscription.status ?? "").toLowerCase();
  const gateway = String((subscription as any).gateway ?? "").toLowerCase();
  const planWeight = isMinistryPlanSlug(slug) || slug === "premium" ? 300 : slug === "plus" ? 200 : 0;
  const statusWeight = isActiveSubscriptionStatus(status) ? (status === "active" ? 40 : 35) : 0;
  const gatewayWeight = gateway === "stripe" ? 3 : gateway === "asaas" ? 2 : 1;
  return planWeight + statusWeight + gatewayWeight;
}

function pickSubscriptionForAccess(subscriptions: Subscription[] | null | undefined, plans: Plan[] | null | undefined) {
  const rows = subscriptions ?? [];
  if (!rows.length) return null;

  const usable = rows
    .filter((subscription) => isSubscriptionUsable(subscription, planSlugForSubscription(plans, subscription)))
    .sort((a, b) => subscriptionRank(b, plans) - subscriptionRank(a, plans));

  return usable[0] ?? rows[0] ?? null;
}

function buildMinistryContextFromRows(
  membership: any,
  ministry: any,
): MinistryAccessContext | null {
  const ministryActive =
    ministry &&
    isActiveSubscriptionStatus(ministry.status);
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
      isActiveSubscriptionStatus(ministry.status)
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
  const profile = await findProfileForUser(supabase, data.user);
  const billingProfileId = profile?.id ?? data.user.id;
  const [{ data: plans }, { data: subscriptions }] = await Promise.all([
    admin.from("plans").select("*"),
    admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", billingProfileId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const isAdmin = isPlatformAdminRole(profile?.role);
  const typedSubscriptions = (subscriptions as Subscription[] | null) ?? [];
  const typedSubscription = pickSubscriptionForAccess(typedSubscriptions, plans) as Subscription | null;
  const plan = planForSubscription(plans, typedSubscription);
  const rawPlanSlug = String(plan?.slug ?? "")
    .trim()
    .toLowerCase();
  const paidPlanSlug = normalizeEffectivePlanSlug(resolveEffectivePlan({ subscription: typedSubscription as any, planSlug: rawPlanSlug }));
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

  const effectiveSlug: EffectivePlanSlug = isAdmin || ministryContext
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
    isAdmin,
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
