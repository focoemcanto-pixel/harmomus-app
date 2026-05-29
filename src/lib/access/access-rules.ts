import { cookies } from "next/headers";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canAccessKit, canUsePitchShift, getDailyKitLimit } from "@/lib/access/access-engine";
import type { PublicKit } from "@/lib/data/public-kits";
import type { CurrentUserAccessContext } from "@/lib/auth/current-user";

const FREE_LIMIT = 3;
const ACCESS_WINDOW_HOURS = 24;
const ACTIVE_FREE_KIT_COOKIE = "harmomus_active_kit_id";

export interface FreeAccessStats {
  accessCountToday: number;
  uniqueKitCount24h: number;
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

async function getActiveFreeKitId() {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(ACTIVE_FREE_KIT_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

async function setActiveFreeKitId(kitId: string) {
  try {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_FREE_KIT_COOKIE, kitId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ACCESS_WINDOW_HOURS * 60 * 60,
      path: "/",
    });
  } catch {}
}

export function canViewKit() {
  return true;
}

export async function getFreeAccessStats(userId: string): Promise<FreeAccessStats> {
  const supabase = createSupabaseAdminClient() as any;
  const { start, nextResetAt } = getAccessWindow();

  const { data, error } = await supabase
    .from("kit_access_logs")
    .select("kit_id")
    .eq("user_id", userId)
    .gte("accessed_at", start);

  if (error) {
    console.error("[access-rules] Could not load kit access logs", {
      userId,
      error,
    });
  }

  const rows = ((data ?? []) as { kit_id: string }[]).filter((row) => row.kit_id);
  const uniqueKitIds = new Set(rows.map((row) => row.kit_id));
  const accessCountToday = uniqueKitIds.size;
  const uniqueKitCount24h = uniqueKitIds.size;
  const remaining = Math.max(0, FREE_LIMIT - uniqueKitCount24h);

  return { accessCountToday, uniqueKitCount24h, remaining, limit: FREE_LIMIT, nextResetAt };
}

export async function registerKitAccess(userId: string, kitId: string): Promise<FreeAccessStats> {
  const supabase = createSupabaseAdminClient() as any;
  const stats = await getFreeAccessStats(userId);
  const activeKitId = await getActiveFreeKitId();

  if (activeKitId === kitId) return stats;
  if (stats.uniqueKitCount24h >= FREE_LIMIT) return stats;

  const { error: insertError } = await supabase.from("kit_access_logs").insert({ user_id: userId, kit_id: kitId });

  if (insertError) {
    console.error("[access-rules] Could not register kit access", {
      userId,
      kitId,
      error: insertError,
    });
    return stats;
  }

  await setActiveFreeKitId(kitId);
  return getFreeAccessStats(userId);
}

export async function canPlayAudio(context: CurrentUserAccessContext, kit: PublicKit) {
  if (context.isGuest) return { allowed: false, reason: "guest" as const };

  if (!canAccessKit(context.effectiveSlug, kit.allowedPlanSlugs)) return { allowed: false, reason: "plan_hierarchy" as const };

  if (context.effectiveSlug === "free" && context.profile) {
    const stats = await getFreeAccessStats(context.profile.id);
    const dailyLimit = getDailyKitLimit(context.effectiveSlug) ?? FREE_LIMIT;
    const activeKitId = await getActiveFreeKitId();

    if (stats.uniqueKitCount24h >= dailyLimit && activeKitId !== kit.id) {
      return { allowed: false, reason: "free_limit" as const, stats };
    }

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
