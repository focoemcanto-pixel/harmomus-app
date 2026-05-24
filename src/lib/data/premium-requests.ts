import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const PREMIUM_MONTHLY_REQUEST_LIMIT = 5;
export type PremiumRequestType = "song" | "tone";

export interface PremiumRequestUsage {
  used: number;
  remaining: number;
  limit: number;
  periodStart: string;
  periodEnd: string;
}

export function getCurrentMonthWindow() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

export async function getPremiumRequestUsage(userId: string): Promise<PremiumRequestUsage> {
  const { periodStart, periodEnd } = getCurrentMonthWindow();
  const supabase = createSupabaseAdminClient() as any;

  const { count, error } = await supabase
    .from("premium_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  if (error) {
    console.error("Falha ao contar solicitações premium", error);
    return { used: 0, remaining: PREMIUM_MONTHLY_REQUEST_LIMIT, limit: PREMIUM_MONTHLY_REQUEST_LIMIT, periodStart, periodEnd };
  }

  const used = count ?? 0;
  return {
    used,
    remaining: Math.max(0, PREMIUM_MONTHLY_REQUEST_LIMIT - used),
    limit: PREMIUM_MONTHLY_REQUEST_LIMIT,
    periodStart,
    periodEnd,
  };
}

export async function createPremiumRequest({
  userId,
  type,
  kitSlug,
  kitName,
  songName,
  artist,
  referenceLink,
  requestedTone,
  voice,
  notes,
}: {
  userId: string;
  type: PremiumRequestType;
  kitSlug?: string | null;
  kitName?: string | null;
  songName: string;
  artist?: string | null;
  referenceLink?: string | null;
  requestedTone?: string | null;
  voice?: string | null;
  notes?: string | null;
}) {
  const usage = await getPremiumRequestUsage(userId);
  if (usage.remaining <= 0) {
    return { allowed: false as const, usage };
  }

  const supabase = createSupabaseAdminClient() as any;
  const { error } = await supabase.from("premium_requests").insert({
    user_id: userId,
    type,
    kit_slug: kitSlug || null,
    kit_name: kitName || songName,
    song_name: songName,
    artist: artist || null,
    reference_link: referenceLink || null,
    requested_tone: requestedTone || null,
    voice: voice || null,
    notes: notes || null,
    status: "pending",
  });

  if (error) throw new Error(error.message);

  const nextUsage = await getPremiumRequestUsage(userId);
  return { allowed: true as const, usage: nextUsage };
}
