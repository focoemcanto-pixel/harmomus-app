export type AccessPlan = "free" | "plus" | "premium";

const DEFAULT_ALLOWED_PLANS: AccessPlan[] = ["free", "plus", "premium"];

function isMinistryPlan(plan: string) {
  return plan === "ministry_10" || plan === "ministry_20" || plan === "ministry_40";
}

export function normalizePlan(plan: unknown): AccessPlan {
  const normalized = String(plan ?? "").trim().toLowerCase();
  if (normalized === "premium" || isMinistryPlan(normalized)) return "premium";
  if (normalized === "plus") return "plus";
  return "free";
}

function normalizeAllowedPlans(allowedPlans?: string[] | null): AccessPlan[] {
  if (!Array.isArray(allowedPlans) || allowedPlans.length === 0) return DEFAULT_ALLOWED_PLANS;
  const normalized = Array.from(new Set(allowedPlans.map(normalizePlan)));
  return normalized.length ? normalized : DEFAULT_ALLOWED_PLANS;
}

export function canAccessKit(userPlan: unknown, allowedPlans?: string[] | null) {
  const plan = normalizePlan(userPlan);
  return normalizeAllowedPlans(allowedPlans).includes(plan);
}

export function canUsePitchShift(plan: unknown) {
  return normalizePlan(plan) === "premium";
}

export function canSavePlaylist(plan: unknown) {
  const normalized = normalizePlan(plan);
  return normalized === "plus" || normalized === "premium";
}

export function canRequestSongs(plan: unknown) {
  return normalizePlan(plan) === "premium";
}

export function canRequestTone(plan: unknown) {
  return normalizePlan(plan) === "premium";
}

export function getDailyKitLimit(plan: unknown) {
  return normalizePlan(plan) === "free" ? 3 : null;
}
