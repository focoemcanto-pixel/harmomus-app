import { createClient } from "@/lib/supabase/server";
import type { PublicKit } from "@/lib/data/public-kits";
import type { Database } from "@/types/database";
import type { CurrentUserAccessContext } from "@/lib/auth/current-user";

const FREE_LIMIT = 5;

export interface FreeAccessStats {
  uniqueKitCount24h: number;
  remaining: number;
  alreadyAccessedInWindow: boolean;
  limit: number;
}

export function canViewKit() {
  return true;
}

export async function getFreeAccessStats(userId: string, kitId?: string): Promise<FreeAccessStats> {
  const supabase = await createClient();
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await (supabase as any)
    .from("kit_access_logs")
    .select("kit_id, accessed_at")
    .eq("user_id", userId)
    .gte("accessed_at", from)
    .order("accessed_at", { ascending: false });

  const uniqueIds = new Set((data ?? []).map((item: any) => item.kit_id));
  const alreadyAccessedInWindow = kitId ? uniqueIds.has(kitId) : false;
  const uniqueKitCount24h = uniqueIds.size;
  const remaining = Math.max(0, FREE_LIMIT - uniqueKitCount24h);

  return { uniqueKitCount24h, remaining, alreadyAccessedInWindow, limit: FREE_LIMIT };
}

export async function registerKitAccess(userId: string, kitId: string): Promise<FreeAccessStats> {
  const stats = await getFreeAccessStats(userId, kitId);
  if (!stats.alreadyAccessedInWindow && stats.uniqueKitCount24h < FREE_LIMIT) {
    const supabase = await createClient();
    await (supabase as any).from("kit_access_logs").insert({ user_id: userId, kit_id: kitId });
  }
  return getFreeAccessStats(userId, kitId);
}

export async function canPlayAudio(context: CurrentUserAccessContext, kit: PublicKit) {
  if (context.isGuest) return { allowed: false, reason: "guest" as const };

  const requiredLevel = (kit.requiredPlan?.slug === "premium" ? 3 : kit.requiredPlan?.slug === "plus" ? 2 : 1);
  if (context.hierarchyLevel < requiredLevel) return { allowed: false, reason: "plan_hierarchy" as const };

  if (context.effectiveSlug === "free" && context.profile) {
    const stats = await getFreeAccessStats(context.profile.id, kit.id);
    if (!stats.alreadyAccessedInWindow && stats.uniqueKitCount24h >= FREE_LIMIT) return { allowed: false, reason: "free_limit" as const, stats };
    return { allowed: true, reason: "ok" as const, stats };
  }

  return { allowed: true, reason: "ok" as const };
}

export function canChangeTone(context: CurrentUserAccessContext, canPlay: boolean) {
  if (!canPlay) return { allowed: false, reason: "cannot_play" as const };
  if (context.effectiveSlug === "premium") return { allowed: true, reason: "ok" as const };
  return { allowed: false, reason: "upgrade_required" as const };
}

export async function resolveKitAccess(context: CurrentUserAccessContext, kit: PublicKit) {
  const play = await canPlayAudio(context, kit);
  const tone = canChangeTone(context, play.allowed);
  return { canView: canViewKit(), play, tone };
}
