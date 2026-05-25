import { createClient } from "@/lib/supabase/server";
import { canAccessKit, canUsePitchShift, getDailyKitLimit } from "@/lib/access/access-engine";
import type { PublicKit } from "@/lib/data/public-kits";
import type { CurrentUserAccessContext } from "@/lib/auth/current-user";

const FREE_LIMIT = 3;

export interface FreeAccessStats {
  accessCountToday: number;
  remaining: number;
  limit: number;
  nextResetAt: string;
}

function getTodayWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const nextReset = new Date(start);
  nextReset.setDate(nextReset.getDate() + 1);
  return { start: start.toISOString(), nextResetAt: nextReset.toISOString() };
}

export function canViewKit() {
  return true;
}

export async function getFreeAccessStats(userId: string): Promise<FreeAccessStats> {
  const supabase = await createClient();
  const { start, nextResetAt } = getTodayWindow();

  const { count } = await (supabase as any)
    .from("kit_access_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("accessed_at", start);

  const accessCountToday = count ?? 0;
  const remaining = Math.max(0, FREE_LIMIT - accessCountToday);

  return { accessCountToday, remaining, limit: FREE_LIMIT, nextResetAt };
}

export async function registerKitAccess(userId: string, kitId: string): Promise<FreeAccessStats> {
  const stats = await getFreeAccessStats(userId);
  if (stats.accessCountToday >= FREE_LIMIT) return stats;

  const supabase = await createClient();
  await (supabase as any).from("kit_access_logs").insert({ user_id: userId, kit_id: kitId });
  return getFreeAccessStats(userId);
}

export async function canPlayAudio(context: CurrentUserAccessContext, kit: PublicKit) {
  if (context.isGuest) return { allowed: false, reason: "guest" as const };

  if (!canAccessKit(context.effectiveSlug, kit.allowedPlanSlugs)) return { allowed: false, reason: "plan_hierarchy" as const };

  if (context.effectiveSlug === "free" && context.profile) {
    const stats = await getFreeAccessStats(context.profile.id);
    const dailyLimit = getDailyKitLimit(context.effectiveSlug) ?? FREE_LIMIT;
    if (stats.accessCountToday >= dailyLimit) return { allowed: false, reason: "free_limit" as const, stats };
    return { allowed: true, reason: "ok" as const, stats };
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
