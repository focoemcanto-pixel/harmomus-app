import {
  getCurrentUserAccessContext,
  type CurrentUserAccessContext,
} from "@/lib/auth/current-user";
import { canRequestSongsAndTones } from "@/lib/data/ministry";

export async function getEffectiveUserPlan() {
  return getCurrentUserAccessContext();
}

export function isMinistryOwner(context: CurrentUserAccessContext) {
  return (
    context.ministry?.role === "owner" || context.ministry?.role === "admin"
  );
}

export function isMinistryManager(context: CurrentUserAccessContext) {
  return (
    context.ministry?.role === "owner" ||
    context.ministry?.role === "admin" ||
    context.ministry?.role === "manager"
  );
}

export function canManageMinistry(context: CurrentUserAccessContext) {
  return isMinistryManager(context);
}

export function canSubmitPremiumRequests(context: CurrentUserAccessContext) {
  return canRequestSongsAndTones({
    isAdmin: context.isAdmin,
    ministryRole: context.ministry?.role ?? null,
    effectiveSlug: context.effectiveSlug,
  });
}
