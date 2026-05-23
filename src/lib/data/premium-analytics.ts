import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TopKit = {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  cover_url: string | null;
  plays: number;
};

export type RecentActivity = {
  id: string;
  label: string;
  created_at: string;
  kit_slug?: string | null;
};

export type PremiumRequestType = "music_request" | "tone_request" | "feedback";
export type PremiumRequestStatus = "new" | "in_review" | "done" | "archived";

export async function getGlobalTopKits(limit = 10): Promise<TopKit[]> {
  const supabase = createSupabaseAdminClient() as any;
  const { data: logs } = await supabase.from("audio_access_logs").select("kit_id").eq("status", "allowed");
  const counts = new Map<string, number>();
  for (const row of logs ?? []) counts.set(row.kit_id, (counts.get(row.kit_id) ?? 0) + 1);
  const ids = Array.from(counts.keys());
  if (!ids.length) return [];

  const { data: kits, error } = await supabase.from("kits").select("id, slug, name, artist, cover_url").in("id", ids).eq("published", true);
  if (error) throw new Error(error.message);

  return (kits ?? [])
    .map((kit: any) => ({ ...kit, plays: counts.get(kit.id) ?? 0 }))
    .sort((a: TopKit, b: TopKit) => b.plays - a.plays)
    .slice(0, limit);
}

export async function getUserTopKits(userId: string, limit = 5): Promise<TopKit[]> {
  const supabase = createSupabaseAdminClient() as any;
  const { data: logs } = await supabase.from("audio_access_logs").select("kit_id").eq("status", "allowed").eq("user_id", userId);
  const counts = new Map<string, number>();
  for (const row of logs ?? []) counts.set(row.kit_id, (counts.get(row.kit_id) ?? 0) + 1);
  const ids = Array.from(counts.keys());
  if (!ids.length) return [];

  const { data: kits, error } = await supabase.from("kits").select("id, slug, name, artist, cover_url").in("id", ids).eq("published", true);
  if (error) throw new Error(error.message);

  return (kits ?? [])
    .map((kit: any) => ({ ...kit, plays: counts.get(kit.id) ?? 0 }))
    .sort((a: TopKit, b: TopKit) => b.plays - a.plays)
    .slice(0, limit);
}

export async function getRecommendedKits(userId: string, limit = 6): Promise<TopKit[]> {
  const supabase = createSupabaseAdminClient() as any;
  const { data: recentLogs } = await supabase
    .from("audio_access_logs")
    .select("kit_id, kits(category_id)")
    .eq("status", "allowed")
    .eq("user_id", userId)
    .order("accessed_at", { ascending: false })
    .limit(30);

  const listenedIds = new Set((recentLogs ?? []).map((row: any) => row.kit_id));
  const categoryIds = Array.from(new Set((recentLogs ?? []).map((row: any) => row.kits?.category_id).filter(Boolean)));

  let query = supabase.from("kits").select("id, slug, name, artist, cover_url").eq("published", true).limit(limit * 2);
  if (categoryIds.length) query = query.in("category_id", categoryIds);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  let recommended = (data ?? []).filter((kit: any) => !listenedIds.has(kit.id)).map((kit: any) => ({ ...kit, plays: 0 }));

  if (recommended.length < limit) {
    const top = await getGlobalTopKits(limit * 2);
    recommended = [...recommended, ...top.filter((kit) => !listenedIds.has(kit.id) && !recommended.some((item) => item.id === kit.id))];
  }

  return recommended.slice(0, limit);
}

export async function getUserRecentActivities(userId: string, limit = 10): Promise<RecentActivity[]> {
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("audio_access_logs")
    .select("id, accessed_at, kit_audio_files(tone, name), kits(name, slug)")
    .eq("status", "allowed")
    .eq("user_id", userId)
    .order("accessed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    created_at: row.accessed_at,
    kit_slug: row.kits?.slug ?? null,
    label: `Ouviu: ${row.kits?.name ?? "Kit"} (${row.kit_audio_files?.tone ?? "tom"} / ${row.kit_audio_files?.name ?? "voz"})`,
  }));
}

export async function getPremiumRequestStats(days = 30) {
  const supabase = createSupabaseAdminClient() as any;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("premium_requests").select("type, status, created_at").gte("created_at", since);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    total: rows.length,
    music: rows.filter((r: any) => r.type === "music_request").length,
    tone: rows.filter((r: any) => r.type === "tone_request").length,
    feedback: rows.filter((r: any) => r.type === "feedback").length,
    new: rows.filter((r: any) => r.status === "new").length,
  };
}

export async function getPremiumRequests() {
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("premium_requests")
    .select("*, profiles(full_name, email, avatar_url), kits(name, slug, artist)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPremiumRequest(input: {
  userId: string;
  type: PremiumRequestType;
  title: string;
  artist?: string | null;
  reference_url?: string | null;
  requested_tone?: string | null;
  urgency?: string | null;
  message?: string | null;
  kit_id?: string | null;
}) {
  const supabase = createSupabaseAdminClient() as any;
  const { error } = await supabase.from("premium_requests").insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    artist: input.artist ?? null,
    reference_url: input.reference_url ?? null,
    requested_tone: input.requested_tone ?? null,
    urgency: input.urgency ?? null,
    message: input.message ?? null,
    kit_id: input.kit_id ?? null,
    status: "new",
  });
  if (error) throw new Error(error.message);
}

export async function updatePremiumRequestStatus(id: string, status: PremiumRequestStatus) {
  const supabase = createSupabaseAdminClient() as any;
  const { error } = await supabase.from("premium_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePremiumRequest(id: string) {
  const supabase = createSupabaseAdminClient() as any;
  const { error } = await supabase.from("premium_requests").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
