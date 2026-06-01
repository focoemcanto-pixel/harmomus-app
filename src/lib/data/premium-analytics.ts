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

export type PremiumRequestType = "song" | "tone" | "feedback";
export type PremiumRequestStatus = "pending" | "reviewing" | "approved" | "done" | "rejected" | "new" | "in_review" | "archived";

type AudioLog = { id: string; kit_id: string | null; accessed_at?: string | null; kits?: { category_id?: string | null } | null };

function sinceDate(days = 90) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function dateKey(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function countByKit(logs: AudioLog[]) {
  const counts = new Map<string, number>();
  for (const row of logs) {
    if (!row.kit_id) continue;
    counts.set(row.kit_id, (counts.get(row.kit_id) ?? 0) + 1);
  }
  return counts;
}

function toAdminRequestType(requestType?: string | null) {
  if (requestType === "tone") return "tone_request";
  if (requestType === "feedback") return "feedback";
  return "music_request";
}

function toDbRequestStatus(status: PremiumRequestStatus) {
  if (status === "new") return "pending";
  if (status === "in_review") return "reviewing";
  if (status === "archived") return "rejected";
  return status;
}

function toAdminRequestStatus(status?: string | null) {
  if (status === "pending") return "new";
  if (status === "reviewing" || status === "approved") return "in_review";
  if (status === "done") return "done";
  if (status === "rejected") return "archived";
  return status ?? "new";
}

async function fetchAllowedAudioLogs(input?: { userId?: string; days?: number; limit?: number; withCategory?: boolean }) {
  const supabase = createSupabaseAdminClient() as any;
  const select = input?.withCategory ? "id,kit_id,accessed_at,kits(category_id)" : "id,kit_id,accessed_at";
  let query = supabase
    .from("audio_access_logs")
    .select(select)
    .eq("status", "allowed")
    .gte("accessed_at", sinceDate(input?.days ?? 90))
    .order("accessed_at", { ascending: false })
    .limit(input?.limit ?? 2000);

  if (input?.userId) query = query.eq("user_id", input.userId);

  const { data, error } = await query;
  if (error) return [] as AudioLog[];
  return (data ?? []) as AudioLog[];
}

async function hydrateTopKits(counts: Map<string, number>, limit: number): Promise<TopKit[]> {
  const supabase = createSupabaseAdminClient() as any;
  const ids = Array.from(counts.keys());
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("kits")
    .select("id, slug, name, artist, cover_url")
    .in("id", ids)
    .eq("published", true);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((kit: any): TopKit => ({ ...kit, plays: counts.get(kit.id) ?? 0 }))
    .sort((a: TopKit, b: TopKit) => b.plays - a.plays)
    .slice(0, limit);
}

export async function getGlobalTopKits(limit = 10): Promise<TopKit[]> {
  const logs = await fetchAllowedAudioLogs({ days: 90, limit: 5000 });
  return hydrateTopKits(countByKit(logs), limit);
}

export async function getUserTopKits(userId: string, limit = 5): Promise<TopKit[]> {
  const logs = await fetchAllowedAudioLogs({ userId, days: 180, limit: 2000 });
  return hydrateTopKits(countByKit(logs), limit);
}

export async function getUserPlayStreak(userId: string): Promise<number> {
  const logs = await fetchAllowedAudioLogs({ userId, days: 120, limit: 2000 });
  const days = new Set(logs.map((row) => dateKey(row.accessed_at)).filter(Boolean) as string[]);
  if (!days.size) return 0;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let cursor = new Date(today);
  let streak = 0;

  for (let i = 0; i < 120; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  if (streak > 0) return streak;

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  cursor = yesterday;

  for (let i = 0; i < 120; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

export async function getRecommendedKits(userId: string, limit = 6): Promise<TopKit[]> {
  const supabase = createSupabaseAdminClient() as any;
  const recentLogs = await fetchAllowedAudioLogs({ userId, days: 180, limit: 50, withCategory: true });
  const listenedIds = new Set<string>(recentLogs.map((row) => row.kit_id).filter(Boolean) as string[]);
  const categoryIds = Array.from(new Set(recentLogs.map((row) => row.kits?.category_id).filter(Boolean)));

  let query = supabase
    .from("kits")
    .select("id, slug, name, artist, cover_url")
    .eq("published", true)
    .limit(limit * 3);

  if (categoryIds.length) query = query.in("category_id", categoryIds);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  let recommended: TopKit[] = (data ?? [])
    .filter((kit: any) => !listenedIds.has(kit.id))
    .map((kit: any): TopKit => ({ ...kit, plays: 0 }));

  if (recommended.length < limit) {
    const top = await getGlobalTopKits(limit * 3);
    const missing = top.filter((kit) => !listenedIds.has(kit.id) && !recommended.some((item) => item.id === kit.id));
    recommended = [...recommended, ...missing];
  }

  if (recommended.length < limit) {
    const { data: newest } = await supabase
      .from("kits")
      .select("id, slug, name, artist, cover_url")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(limit * 2);

    const fallback = (newest ?? [])
      .filter((kit: any) => !listenedIds.has(kit.id) && !recommended.some((item) => item.id === kit.id))
      .map((kit: any): TopKit => ({ ...kit, plays: 0 }));

    recommended = [...recommended, ...fallback];
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

  return (data ?? []).map((row: any): RecentActivity => ({
    id: row.id,
    created_at: row.accessed_at,
    kit_slug: row.kits?.slug ?? null,
    label: `Ouviu: ${row.kits?.name ?? "Kit"} (${row.kit_audio_files?.tone ?? "tom"} / ${row.kit_audio_files?.name ?? "faixa"})`,
  }));
}

export async function getPremiumRequestStats(days = 30) {
  const supabase = createSupabaseAdminClient() as any;
  const since = sinceDate(days);
  const { data, error } = await supabase
    .from("premium_requests")
    .select("request_type, status, created_at")
    .gte("created_at", since);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    total: rows.length,
    music: rows.filter((r: any) => r.request_type === "song").length,
    tone: rows.filter((r: any) => r.request_type === "tone").length,
    feedback: rows.filter((r: any) => r.request_type === "feedback").length,
    new: rows.filter((r: any) => r.status === "pending").length,
  };
}

export async function getPremiumRequests() {
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("premium_requests")
    .select("*, profile:profiles(full_name, email, avatar_url), kit:kits(name, slug, artist)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    ...row,
    type: toAdminRequestType(row.request_type),
    status: toAdminRequestStatus(row.status),
    title: row.song_name ?? row.kit_name ?? "Solicitação premium",
    artist: row.artist_name ?? row.kit?.artist ?? null,
    requested_tone: row.desired_tone ?? row.requested_tone ?? null,
    reference_url: row.reference_link ?? null,
    message: row.notes ?? null,
    profiles: row.profile ?? row.profiles ?? null,
  }));
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
  const requestType = input.type === "tone" ? "tone" : input.type === "feedback" ? "feedback" : "song";

  const { error } = await supabase.from("premium_requests").insert({
    user_id: input.userId,
    request_type: requestType,
    song_name: input.title,
    artist_name: input.artist ?? null,
    reference_link: input.reference_url ?? null,
    desired_tone: input.requested_tone ?? null,
    notes: input.message ?? null,
    kit_id: input.kit_id ?? null,
    status: "pending",
  });

  if (error) throw new Error(error.message);
}

export async function updatePremiumRequestStatus(id: string, status: PremiumRequestStatus) {
  const supabase = createSupabaseAdminClient() as any;
  const { error } = await supabase
    .from("premium_requests")
    .update({ status: toDbRequestStatus(status), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePremiumRequest(id: string) {
  const supabase = createSupabaseAdminClient() as any;
  const { error } = await supabase.from("premium_requests").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
