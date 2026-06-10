import { normalizePlan, type AccessPlan } from "@/lib/access/access-engine";

export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

export type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

const ACTIVE_SUBSCRIPTION_STATUS_SET = new Set<string>(ACTIVE_SUBSCRIPTION_STATUSES);

type EffectivePlanSubscription = {
  status?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  canceled_at?: string | null;
} | null | undefined;

type EffectivePlanInput = {
  subscription?: EffectivePlanSubscription;
  plan?: { slug?: string | null } | null;
  planSlug?: string | null;
  now?: Date;
};

function toTime(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function isActiveSubscriptionStatus(status: unknown) {
  return ACTIVE_SUBSCRIPTION_STATUS_SET.has(String(status ?? "").trim().toLowerCase());
}

export function hasFutureSubscriptionPeriod(subscription: EffectivePlanSubscription, now = new Date()) {
  const periodEnd = toTime(subscription?.current_period_end);
  return periodEnd !== null && periodEnd > now.getTime();
}

export function resolveEffectivePlan({ subscription, plan, planSlug, now = new Date() }: EffectivePlanInput): AccessPlan {
  if (!subscription) return "free";

  const normalizedPlanSlug = normalizePlan(planSlug ?? plan?.slug);
  const status = String(subscription.status ?? "").trim().toLowerCase();
  const hasValidPeriod = hasFutureSubscriptionPeriod(subscription, now);
  const periodEnd = toTime(subscription.current_period_end);

  if (periodEnd !== null && periodEnd <= now.getTime()) return "free";
  if (subscription.canceled_at && !hasValidPeriod) return "free";

  if (isActiveSubscriptionStatus(status)) return normalizedPlanSlug;

  if (status === "canceled" && subscription.cancel_at_period_end === true && hasValidPeriod) {
    return normalizedPlanSlug;
  }

  return "free";
}

export function hasPaidEffectivePlan({ subscription, plan, planSlug, now }: EffectivePlanInput) {
  return resolveEffectivePlan({ subscription, plan, planSlug, now }) !== "free";
}
