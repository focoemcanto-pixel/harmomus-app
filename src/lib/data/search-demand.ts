import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SearchDemandPeriod = "7" | "30" | "90";

export type SearchDemandFilters = {
  period?: SearchDemandPeriod;
  query?: string;
};

type SearchEvent = {
  id: string;
  user_id?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
};

function sinceDate(period: SearchDemandPeriod = "30") {
  const date = new Date();
  date.setDate(date.getDate() - Number(period) + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function normalize(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function getSearchEvents(filters: SearchDemandFilters): Promise<SearchEvent[]> {
  const supabase = createSupabaseAdminClient() as any;
  const response = await supabase
    .from("usage_tracking")
    .select("id,user_id,metadata,created_at")
    .eq("action", "catalog_search")
    .gte("created_at", sinceDate(filters.period ?? "30"))
    .order("created_at", { ascending: false })
    .limit(10000);

  if (response.error) return [];
  const queryFilter = normalize(filters.query);
  const rows = (response.data ?? []) as SearchEvent[];
  if (!queryFilter) return rows;

  return rows.filter((row) => {
    const metadata = row.metadata ?? {};
    return normalize(String(metadata.query ?? metadata.normalizedQuery ?? "")).includes(queryFilter);
  });
}

function eventData(row: SearchEvent) {
  const metadata = row.metadata ?? {};
  const query = String(metadata.query ?? "").trim();
  const normalizedQuery = normalize(String(metadata.normalizedQuery ?? query));
  const resultCount = Math.max(0, Number(metadata.resultCount ?? 0) || 0);
  return {
    query: query || normalizedQuery || "Busca não informada",
    normalizedQuery: normalizedQuery || normalize(query) || "busca-nao-informada",
    resultCount,
    found: typeof metadata.found === "boolean" ? metadata.found : resultCount > 0,
    source: String(metadata.source ?? "biblioteca"),
    viewerPlan: String(metadata.viewerPlan ?? "não informado"),
  };
}

export async function getSearchDemandDashboard(filters: SearchDemandFilters) {
  const rows = await getSearchEvents(filters);
  const uniqueUsers = new Set(rows.map((row) => row.user_id).filter(Boolean));
  const uniqueTerms = new Set<string>();
  const misses = rows.filter((row) => !eventData(row).found);
  const hits = rows.filter((row) => eventData(row).found);

  const demandMap = new Map<string, {
    query: string;
    searches: number;
    uniqueUsers: Set<string>;
    lastSearch: string;
    source: string;
  }>();

  for (const row of misses) {
    const data = eventData(row);
    uniqueTerms.add(data.normalizedQuery);
    const current = demandMap.get(data.normalizedQuery) ?? {
      query: data.query,
      searches: 0,
      uniqueUsers: new Set<string>(),
      lastSearch: row.created_at ?? "",
      source: data.source,
    };
    current.searches += 1;
    if (row.user_id) current.uniqueUsers.add(row.user_id);
    if ((row.created_at ?? "") > current.lastSearch) {
      current.lastSearch = row.created_at ?? "";
      current.query = data.query;
      current.source = data.source;
    }
    demandMap.set(data.normalizedQuery, current);
  }

  for (const row of hits) uniqueTerms.add(eventData(row).normalizedQuery);

  const successfulMap = new Map<string, number>();
  for (const row of hits) {
    const data = eventData(row);
    successfulMap.set(data.query, (successfulMap.get(data.query) ?? 0) + 1);
  }

  const sourceMap = new Map<string, number>();
  for (const row of rows) {
    const source = eventData(row).source;
    sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
  }

  const demand = Array.from(demandMap.values())
    .map((item) => ({
      query: item.query,
      searches: item.searches,
      uniqueUsers: item.uniqueUsers.size,
      lastSearch: item.lastSearch,
      source: item.source,
    }))
    .sort((a, b) => b.searches - a.searches || b.uniqueUsers - a.uniqueUsers || b.lastSearch.localeCompare(a.lastSearch));

  const successful = Array.from(successfulMap.entries())
    .map(([query, searches]) => ({ query, searches }))
    .sort((a, b) => b.searches - a.searches)
    .slice(0, 10);

  const sources = Array.from(sourceMap.entries())
    .map(([source, searches]) => ({ source, searches }))
    .sort((a, b) => b.searches - a.searches);

  return {
    summary: {
      searches: rows.length,
      missedSearches: misses.length,
      foundSearches: hits.length,
      missRate: rows.length ? Number(((misses.length / rows.length) * 100).toFixed(1)) : 0,
      uniqueTerms: uniqueTerms.size,
      uniqueUsers: uniqueUsers.size,
    },
    demand,
    successful,
    sources,
    recent: rows.slice(0, 50).map((row) => {
      const data = eventData(row);
      return {
        id: row.id,
        query: data.query,
        resultCount: data.resultCount,
        found: data.found,
        source: data.source,
        viewerPlan: data.viewerPlan,
        createdAt: row.created_at ?? "",
      };
    }),
  };
}
