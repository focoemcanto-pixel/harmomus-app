import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AnalyticsPeriod = "7" | "30" | "90";
type AnalyticsPlan = "all" | "free" | "plus" | "premium";
type AnalyticsDevice = "all" | "mobile" | "desktop";

export type AnalyticsFilters = {
  period?: AnalyticsPeriod;
  plan?: AnalyticsPlan;
  device?: AnalyticsDevice;
  query?: string;
};

type AccessLogRow = {
  id: string;
  user_id?: string | null;
  session_id?: string | null;
  kit_id?: string | null;
  audio_file_id?: string | null;
  accessed_at?: string | null;
  created_at?: string | null;
  status?: string | null;
  reason?: string | null;
  device_type?: string | null;
  plan_slug?: string | null;
  page_path?: string | null;
  kit_audio_files?: { name?: string | null; tone?: string | null } | null;
  kits?: { id: string; name?: string | null; slug?: string | null } | null;
  profiles?: { full_name?: string | null; email?: string | null } | null;
};

const safe = <T,>(value: T, fallback: T): T => value ?? fallback;
const norm = (value?: string | null) => (value ?? "").toLowerCase().trim();

function sinceDate(period: AnalyticsPeriod = "30") {
  const days = Number(period);
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function isAllowed(row: AccessLogRow) {
  return norm(row.status) === "allowed";
}

function isDenied(row: AccessLogRow) {
  return norm(row.status) === "denied";
}

function filterRows(rows: AccessLogRow[], filters: AnalyticsFilters) {
  return rows.filter((row) => {
    const plan = norm(row.plan_slug) || "não informado";
    const device = norm(row.device_type) || "não informado";
    const query = norm(filters.query);
    const song = norm(row.kit_audio_files?.name);
    const kit = norm(row.kits?.name);

    if (filters.plan && filters.plan !== "all" && plan !== filters.plan) return false;
    if (filters.device && filters.device !== "all" && device !== filters.device) return false;
    if (query && !song.includes(query) && !kit.includes(query)) return false;
    return true;
  });
}

async function getBaseLogs(filters: AnalyticsFilters): Promise<AccessLogRow[]> {
  const supabase = createSupabaseAdminClient() as any;
  const since = sinceDate(filters.period ?? "30");

  const fullSelect = "id,user_id,session_id,kit_id,audio_file_id,accessed_at,created_at,status,reason,device_type,plan_slug,page_path,kit_audio_files(name,tone),kits(id,name,slug),profiles(full_name,email)";
  const legacySelect = "id,user_id,kit_id,audio_file_id,accessed_at,status,reason,kit_audio_files(name,tone),kits(id,name,slug),profiles(full_name,email)";

  const fullResponse = await supabase
    .from("audio_access_logs")
    .select(fullSelect)
    .gte("accessed_at", since)
    .order("accessed_at", { ascending: false })
    .limit(5000);

  if (!fullResponse.error) {
    return filterRows((fullResponse.data ?? []) as AccessLogRow[], filters);
  }

  const legacyResponse = await supabase
    .from("audio_access_logs")
    .select(legacySelect)
    .gte("accessed_at", since)
    .order("accessed_at", { ascending: false })
    .limit(5000);

  if (legacyResponse.error) return [];
  return filterRows((legacyResponse.data ?? []) as AccessLogRow[], filters);
}

export async function getAdminAnalyticsSummary(filters: AnalyticsFilters) {
  const supabase = createSupabaseAdminClient() as any;
  const [logs, subscriptions, plans] = await Promise.all([
    getBaseLogs(filters),
    supabase.from("subscriptions").select("id,user_id,plan_id,status,billing_cycle").eq("status", "active").then((r: any) => r.data ?? []),
    supabase.from("plans").select("id,slug,name").then((r: any) => r.data ?? []),
  ]);

  const allowedLogs = logs.filter(isAllowed);
  const deniedLogs = logs.filter(isDenied);
  const uniqueUsers = new Set(allowedLogs.map((l) => l.user_id).filter(Boolean));
  const uniqueSessions = new Set(allowedLogs.map((l) => l.session_id ?? l.id).filter(Boolean));
  const days = Number(filters.period ?? "30");
  const planById = new Map((plans as any[]).map((p) => [p.id, p.slug]));
  const activePlanSlugs = (subscriptions as any[]).map((s) => planById.get(s.plan_id) ?? "free");
  const totalAttempts = allowedLogs.length + deniedLogs.length;

  return {
    plays: allowedLogs.length,
    denied: deniedLogs.length,
    totalAttempts,
    denyRate: totalAttempts ? Number(((deniedLogs.length / totalAttempts) * 100).toFixed(1)) : 0,
    uniqueUsers: uniqueUsers.size,
    uniqueSessions: uniqueSessions.size,
    avgDailyPlays: Number((allowedLogs.length / days).toFixed(1)),
    activeSubscribers: (subscriptions as any[]).length,
    premiumActive: activePlanSlugs.filter((s) => s === "premium" || String(s).startsWith("ministry_")).length,
    plusActive: activePlanSlugs.filter((s) => s === "plus").length,
    freeActive: activePlanSlugs.filter((s) => s === "free").length,
    annual: (subscriptions as any[]).filter((s) => s.billing_cycle === "annual").length,
    monthly: (subscriptions as any[]).filter((s) => s.billing_cycle === "monthly").length,
  };
}

export async function getPlaysByDay(filters: AnalyticsFilters) {
  const logs = (await getBaseLogs(filters)).filter(isAllowed);
  const map = new Map<string, number>();
  logs.forEach((l) => {
    const source = l.accessed_at ?? l.created_at ?? new Date().toISOString();
    const d = new Date(source).toISOString().slice(0, 10);
    map.set(d, (map.get(d) ?? 0) + 1);
  });
  return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, plays]) => ({ date, plays }));
}

export async function getDeviceBreakdown(filters: AnalyticsFilters) {
  const logs = (await getBaseLogs(filters)).filter(isAllowed);
  const map = new Map<string, number>();
  logs.forEach((l)=>{ const k = norm(l.device_type) || "não informado"; map.set(k, (map.get(k)??0)+1); });
  return Array.from(map.entries()).map(([label, value])=>({label,value}));
}

export async function getPlanBreakdown(filters: AnalyticsFilters) {
  const logs = (await getBaseLogs(filters)).filter(isAllowed);
  const map = new Map<string, number>();
  logs.forEach((l)=>{ const k = norm(l.plan_slug) || "não informado"; map.set(k, (map.get(k)??0)+1); });
  return Array.from(map.entries()).map(([label, value])=>({label,value}));
}

function topN(map: Map<string, number>, limit = 10) { return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0, limit).map(([label, value])=>({ label, value })); }
export async function getTopSongs(filters: AnalyticsFilters) { const logs = (await getBaseLogs(filters)).filter(isAllowed); const map = new Map<string, number>(); logs.forEach((l)=>{ const k = l.kit_audio_files?.name ?? "Faixa não informada"; map.set(k, (map.get(k)??0)+1); }); return topN(map); }
export async function getTopKits(filters: AnalyticsFilters) { const logs = (await getBaseLogs(filters)).filter(isAllowed); const map = new Map<string, number>(); logs.forEach((l)=>{ const k = l.kits?.name ?? "Kit não informado"; map.set(k, (map.get(k)??0)+1); }); return topN(map); }
export async function getTopUsers(filters: AnalyticsFilters) { const logs = (await getBaseLogs(filters)).filter(isAllowed); const map = new Map<string, number>(); logs.forEach((l)=>{ const k = l.profiles?.full_name || l.profiles?.email || l.user_id || "Usuário não informado"; map.set(k, (map.get(k)??0)+1); }); return topN(map); }
export async function getTopTones(filters: AnalyticsFilters) { const logs = (await getBaseLogs(filters)).filter(isAllowed); const map = new Map<string, number>(); logs.forEach((l)=>{ const k = l.kit_audio_files?.tone ?? "Tom não informado"; map.set(k, (map.get(k)??0)+1); }); return topN(map); }
export async function getTopVoices(filters: AnalyticsFilters) { const logs = (await getBaseLogs(filters)).filter(isAllowed); const map = new Map<string, number>(); logs.forEach((l)=>{ const k = l.kit_audio_files?.name ?? "Voz/Faixa não informada"; map.set(k, (map.get(k)??0)+1); }); return topN(map); }

export async function getTopDeniedReasons(filters: AnalyticsFilters) {
  const logs = (await getBaseLogs(filters)).filter(isDenied);
  const map = new Map<string, number>();
  logs.forEach((l) => {
    const k = l.reason ?? "motivo não informado";
    map.set(k, (map.get(k) ?? 0) + 1);
  });
  return topN(map);
}

export async function getTopDeniedKits(filters: AnalyticsFilters) {
  const logs = (await getBaseLogs(filters)).filter(isDenied);
  const map = new Map<string, number>();
  logs.forEach((l) => {
    const k = l.kits?.name ?? "Kit não informado";
    map.set(k, (map.get(k) ?? 0) + 1);
  });
  return topN(map);
}

export async function getTopGatePages(filters: AnalyticsFilters) {
  const logs = (await getBaseLogs(filters)).filter(isDenied);
  const map = new Map<string, number>();
  logs.forEach((l) => {
    const k = l.page_path ?? "página não informada";
    map.set(k, (map.get(k) ?? 0) + 1);
  });
  return topN(map);
}

export async function getRecentPlays(filters: AnalyticsFilters) {
  const logs = (await getBaseLogs(filters)).filter(isAllowed);
  return logs.slice(0, 50).map((row) => ({
    when: row.accessed_at ?? row.created_at ?? "",
    kit: row.kits?.name ?? "Kit não informado",
    kitSlug: row.kits?.slug ?? "",
    track: row.kit_audio_files?.name ?? "Faixa não informada",
    user: row.profiles?.full_name ?? row.profiles?.email ?? row.user_id ?? "Usuário não informado",
    plan: row.plan_slug ?? "não informado",
    device: row.device_type ?? "não informado",
    toneVoice: `${row.kit_audio_files?.tone ?? "Tom não informado"} / ${row.kit_audio_files?.name ?? "Voz/Faixa não informada"}`,
    page: row.page_path ?? "não informado",
  }));
}

export async function getRecentDenied(filters: AnalyticsFilters) {
  const logs = (await getBaseLogs(filters)).filter(isDenied);
  return logs.slice(0, 30).map((row) => ({
    when: row.accessed_at ?? row.created_at ?? "",
    kit: row.kits?.name ?? "Kit não informado",
    kitSlug: row.kits?.slug ?? "",
    track: row.kit_audio_files?.name ?? "Faixa não informada",
    user: row.profiles?.full_name ?? row.profiles?.email ?? row.user_id ?? "Usuário não informado",
    plan: row.plan_slug ?? "não informado",
    device: row.device_type ?? "não informado",
    reason: row.reason ?? "motivo não informado",
    page: row.page_path ?? "não informado",
  }));
}

export async function getPremiumRequestsSummary(_filters?: AnalyticsFilters) {
  const supabase = createSupabaseAdminClient() as any;
  const { data } = await supabase.from("premium_requests").select("id,status");
  const rows = safe(data as any[], []);
  return { open: rows.filter((r) => ["pending", "reviewing", "approved", "new", "in_review"].includes(norm(r.status))).length, total: rows.length };
}
