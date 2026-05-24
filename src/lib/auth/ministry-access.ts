import { getCurrentUserAccessContext, type CurrentUserAccessContext } from "@/lib/auth/current-user";

export async function getEffectiveUserPlan() {
  return getCurrentUserAccessContext();
}

export function isMinistryOwner(context: CurrentUserAccessContext) {
  return context.ministry?.role === "owner";
}

export function isMinistryManager(context: CurrentUserAccessContext) {
  return context.ministry?.role === "owner" || context.ministry?.role === "manager";
}

export function canManageMinistry(context: CurrentUserAccessContext) {
  return isMinistryManager(context);
}

export function canSubmitPremiumRequests(context: CurrentUserAccessContext) {
  return context.effectiveSlug === "premium" && (!context.ministry || isMinistryManager(context));
}
