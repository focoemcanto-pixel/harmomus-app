import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canAccessKit, canUsePitchShift, getDailyKitLimit } from "@/lib/access/access-engine";
import type { PublicKit } from "@/lib/data/public-kits";
import type { CurrentUserAccessContext } from "@/lib/auth/current-user";

const FREE_LIMIT = 3;
const ACCESS_WINDOW_HOURS = 24;

export interface FreeAccessStats {
  accessCountToday: number;
  remaining: number;
  limit: number;
  nextResetAt: string;
}

function getAccessWindow() {
  const now = new Date();
  const start = new Date(now.getTime() - ACCESS_WINDOW_HOURS * 60 * 60 * 1000);
  const nextReset = new Date(now.getTime() + ACCESS_WINDOW_HOURS * 60 * 60 * 1000);
  return { start: start.toISOString(), nextResetAt: nextReset.toISOString() };
}

function summarizeAccessCount(accessCountToday: number, limit = FREE_LIMIT) {
  const remaining = Math.max(0, limit - accessCountToday);

  return {
    accessCountToday,
    remaining,
  };
}

export function canViewKit() {
  return true;
}

export async function getFreeAccessStats(userId: string): Promise<FreeAccessStats> {
  const supabase = createSupabaseAdminClient() as any;
  const { start, nextResetAt } = getAccessWindow();

  const { count, error } = await supabase
    .from("kit_access_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("accessed_at", start)
    .not("kit_id", "is", null);

  if (error) {
    console.error("[access-rules] Could not load kit access logs", {
      userId,
      error,
    });
  }

  const summary = summarizeAccessCount(count ?? 0, FREE_LIMIT);

  return { ...summary, limit: FREE_LIMIT, nextResetAt };
}

export async function registerKitAccess(userId: string, kitId: string): Promise<FreeAccessStats> {
  const supabase = createSupabaseAdminClient() as any;
  const normalizedKitId = String(kitId ?? "").trim();
  const stats = await getFreeAccessStats(userId);

  if (!normalizedKitId) return stats;
  if (stats.accessCountToday >= FREE_LIMIT) return stats;

  const { error: insertError } = await supabase.from("kit_access_logs").insert({ user_id: userId, kit_id: normalizedKitId });

  if (insertError) {
    console.error("[access-rules] Could not register kit access", {
      userId,
      kitId: normalizedKitId,
      error: insertError,
    });
    return stats;
  }

  return getFreeAccessStats(userId);
}

function kitAllowsFree(kit: PublicKit) {
  const allowed = Array.isArray(kit.allowedPlanSlugs) ? kit.allowedPlanSlugs : [];
  if (allowed.includes("free")) return true;
  return kit.requiredPlan?.slug === "free";
}

function resolveMinimumPlan(kit: PublicKit) {
  const allowed = Array.isArray(kit.allowedPlanSlugs) ? kit.allowedPlanSlugs : [];
  if (kit.requiredPlan?.slug === "plus" || allowed.includes("plus")) return "plus" as const;
  return "premium" as const;
}

export async function canPlayAudio(context: CurrentUserAccessContext, kit: PublicKit) {
  if (context.isGuest) return { allowed: false, reason: "guest" as const };

  if (context.effectiveSlug === "free" && context.profile) {
    const stats = await getFreeAccessStats(context.profile.id);
    const dailyLimit = getDailyKitLimit(context.effectiveSlug) ?? FREE_LIMIT;

    if (kitAllowsFree(kit) && stats.accessCountToday >= dailyLimit) {
      return { allowed: false, reason: "free_limit" as const, stats: { ...stats, limit: dailyLimit } };
    }

    if (!canAccessKit(context.effectiveSlug, kit.allowedPlanSlugs)) {
      const requiredPlan = resolveMinimumPlan(kit);
      return { allowed: false, reason: "plan_hierarchy" as const, requiredPlan };
    }

    return { allowed: true, reason: "ok" as const, stats: { ...stats, limit: dailyLimit } };
  }

  if (!canAccessKit(context.effectiveSlug, kit.allowedPlanSlugs)) {
    const requiredPlan = resolveMinimumPlan(kit);
    return { allowed: false, reason: "plan_hierarchy" as const, requiredPlan };
  }

  return { allowed: true, reason: "ok" as const };
}

export function canChangeTone(context: CurrentUserAccessContext, canPlay: boolean) {
  if (!canPlay) return { allowed: false, reason: "cannot_play" as const };
  if (canUsePitchShift(context.effectiveSlug)) return { allowed: true, reason: "ok" as const };
  return { allowed: false, reason: "upgrade_required" as const };
}

export async function resolveKitAccess(context: CurrentUserAccessContext, kit: PublicKit) {
  const play = await canPlayAudio(context, kit);
  const tone = canChangeTone(context, play.allowed);
  return { canView: canViewKit(), play, tone };
}
