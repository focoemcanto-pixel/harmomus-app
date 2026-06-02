import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AudienceContact, Channel, CommunicationCampaign, CommunicationQueueItem } from "@/types/communication";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;
type QueryResult<T> = { data: T | null; error: { message?: string; code?: string } | null; count?: number | null };

type LogLite = { id?: string; status?: string | null; channel?: string | null; created_at?: string | null; event?: string | null; level?: string | null };
type EventLite = { event_type?: string | null; event_key?: string | null; event_label?: string | null; created_at?: string | null };
type DeliveryLite = { id?: string; status?: string | null; channel?: string | null; opened_at?: string | null; clicked_at?: string | null; converted_at?: string | null; created_at?: string | null };
type ProfileLite = { id: string; full_name?: string | null; email?: string | null; phone?: string | null; whatsapp_opt_in?: boolean | null; email_opt_in?: boolean | null; last_seen_at?: string | null; created_at?: string | null; origin?: string | null };
type SubscriptionLite = { id?: string; user_id: string; status?: string | null; plans?: { name?: string | null; slug?: string | null; hierarchy_level?: number | null } | null; updated_at?: string | null; canceled_at?: string | null; current_period_end?: string | null };
type AccessLite = { user_id?: string | null; status?: string | null; reason?: string | null; accessed_at?: string | null; created_at?: string | null; kits?: { name?: string | null; slug?: string | null } | null };
type InvoiceLite = { user_id?: string | null; status?: string | null; amount_due_cents?: number | null; created_at?: string | null; customer_email?: string | null; profiles?: { id?: string | null; email?: string | null } | null };
type HistoryLite = { id?: string; change_type?: string | null; from_plan_slug?: string | null; to_plan_slug?: string | null; created_at?: string | null };

export type CommunicationLogRow = {
  id: string;
  campaign_id: string | null;
  user_id: string | null;
  channel: string | null;
  status: string | null;
  created_at: string;
  details?: Record<string, unknown> | null;
  campaign?: { name?: string | null } | null;
  profile?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
};

export type SmartSegment = {
  slug: string;
  title: string;
  category: "Upgrade" | "Recuperação" | "Engajamento" | "Premium/Plus" | "Conteúdo";
  count: number;
  description: string;
  rule: string;
  sources: string[];
  quality: "real" | "partial" | "insufficient";
  warning?: string;
  href: string;
};

export type RecommendedCampaign = {
  slug: string;
  title: string;
  audience: string;
  reason: string;
  channel: "WhatsApp" | "E-mail" | "WhatsApp + E-mail";
  segmentSlug: string;
  ctaHref: string;
  count: number;
};

export type CommercialFunnelItem = { label: string; count: number; hint: string };
export type CommunicationWarning = { source: string; message: string };

export type CommunicationDashboardData = {
  contacts: number;
  activeCampaigns: number;
  sent: number;
  pending: number;
  failed: number;
  openRate: number | null;
  ctr: number | null;
  conversion: number | null;
  operationalHealth: { label: string; score: number; tone: "emerald" | "amber" | "rose" };
  deliveries: DeliveryLite[];
  segments: SmartSegment[];
  recommendedCampaigns: RecommendedCampaign[];
  funnel: CommercialFunnelItem[];
  warnings: CommunicationWarning[];
};

export type AudienceSummary = { total: number; whatsappOptIn: number; emailOptIn: number; withPhone: number; withEmail: number; active30d: number; commercialStatus: Record<string, number> };
export type AudienceRow = AudienceContact & {
  name: string | null;
  current_plan: string | null;
  commercial_status: string;
  recent_plays: number;
  premium_blocks: number;
  last_activity_at: string | null;
};

const ACTIVE_CAMPAIGN_STATUSES = ["scheduled", "processing", "queued", "sending"];
const PENDING_STATUSES = ["queued", "pending", "fila", "pendente", "processing"];
const FAILED_STATUSES = ["failed", "erro", "falhou", "error"];
const SENT_STATUSES = ["sent", "delivered", "enviado", "entregue", "opened", "clicked", "replied"];
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"];

function safeRate(part: number, total: number) {
  return total ? (part / total) * 100 : null;
}

function normalize(value?: string | null) {
  return String(value ?? "").toLowerCase().trim();
}

function normalizeStatus(status?: string | null) {
  const value = normalize(status);
  if (SENT_STATUSES.includes(value)) return value === "opened" || value === "clicked" ? value : "sent";
  if (PENDING_STATUSES.includes(value)) return "queued";
  if (["open", "opened", "abriu", "email_open", "email_opened"].includes(value)) return "opened";
  if (["click", "clicked", "clicou", "whatsapp_click", "link_clicked"].includes(value)) return "clicked";
  if (["reply", "replied", "respondeu"].includes(value)) return "replied";
  if (FAILED_STATUSES.includes(value)) return "failed";
  return value || "unknown";
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function safeQuery<T>(source: string, query: PromiseLike<QueryResult<T>>, warnings: CommunicationWarning[]) {
  const result = await query;
  if (result.error) {
    warnings.push({ source, message: result.error.message ?? "Consulta indisponível." });
    return { data: null as T | null, count: result.count ?? 0, error: result.error };
  }
  return { data: result.data, count: result.count ?? 0, error: null };
}

function dedupe<T extends { id?: string | null }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) if (row.id && !map.has(row.id)) map.set(row.id, row);
  return Array.from(map.values());
}

function isActiveSubscription(row?: SubscriptionLite) {
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(normalize(row?.status));
}

function planSlug(row?: SubscriptionLite | null) {
  return normalize(row?.plans?.slug) || "free";
}

function currentPlanLabel(slug?: string | null) {
  const value = normalize(slug) || "free";
  if (value.includes("premium")) return "Premium";
  if (value.includes("plus")) return "Plus";
  if (value.includes("ministry")) return "Ministerial";
  return "Free";
}

function commercialStatus(input: { subscription?: SubscriptionLite; plays: number; blocks: number; lastActivity?: string | null; failedPayment?: boolean }) {
  const status = normalize(input.subscription?.status);
  const plan = planSlug(input.subscription);
  if (input.failedPayment || ["overdue", "past_due", "pending"].includes(status)) return "Recuperação de pagamento";
  if (status === "canceled" || status === "expired") return "Cancelado / recuperação";
  if (["free", "plus", ""].includes(plan) && input.blocks > 0) return "Lead quente para upgrade";
  if (input.lastActivity && new Date(input.lastActivity).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000) return "Engajado";
  return "Nutrição";
}

function makeSegment(slug: string, title: string, category: SmartSegment["category"], ids: Set<string>, description: string, rule: string, sources: string[], href = `/admin/comunicacao/campaigns?segment=${slug}`): SmartSegment {
  const quality: SmartSegment["quality"] = sources.length ? "real" : "insufficient";
  return { slug, title, category, count: ids.size, description, rule, sources, quality, href };
}

async function getBaseData() {
  const supabase = createSupabaseAdminClient() as SupabaseAdmin & any;
  const warnings: CommunicationWarning[] = [];
  const since7 = daysAgo(7);
  const since30 = daysAgo(30);
  const since45 = daysAgo(45);

  const [profilesResult, subscriptionsResult, accessResult, invoicesResult, commLogsResult, marketingEventsResult, commCampaignsCount, historyResult, queueCount] = await Promise.all([
    safeQuery<ProfileLite[]>("profiles", supabase.from("profiles").select("id,full_name,email,phone,whatsapp_opt_in,email_opt_in,last_seen_at,origin,created_at").order("created_at", { ascending: false }).limit(1000), warnings),
    safeQuery<SubscriptionLite[]>("subscriptions", supabase.from("subscriptions").select("id,user_id,status,updated_at,canceled_at,current_period_end,plans(name,slug,hierarchy_level)").order("updated_at", { ascending: false }).limit(1000), warnings),
    safeQuery<AccessLite[]>("audio_access_logs", supabase.from("audio_access_logs").select("user_id,status,reason,accessed_at,created_at,kits(name,slug)").gte("accessed_at", since45).order("accessed_at", { ascending: false }).limit(5000), warnings),
    safeQuery<InvoiceLite[]>("billing_invoices", supabase.from("billing_invoices").select("user_id,status,amount_due_cents,created_at,customer_email,profiles(id,email)").order("created_at", { ascending: false }).limit(1000), warnings),
    safeQuery<LogLite[]>("communication_logs", supabase.from("communication_logs").select("id,status,channel,created_at").order("created_at", { ascending: false }).limit(5000), warnings),
    safeQuery<EventLite[]>("marketing_events", supabase.from("marketing_events").select("event_type,created_at").order("created_at", { ascending: false }).limit(5000), warnings),
    safeQuery<null>("communication_campaigns", supabase.from("communication_campaigns").select("id", { count: "exact", head: true }).in("status", ACTIVE_CAMPAIGN_STATUSES), warnings),
    safeQuery<HistoryLite[]>("subscription_history", supabase.from("subscription_history").select("id,change_type,from_plan_slug,to_plan_slug,created_at").gte("created_at", since30).order("created_at", { ascending: false }).limit(2000), warnings),
    safeQuery<null>("communication_queue", supabase.from("communication_queue").select("id", { count: "exact", head: true }).in("status", ["pending", "processing", "queued"]), warnings),
  ]);

  const profiles = profilesResult.data ?? [];
  const subscriptions = subscriptionsResult.data ?? [];
  const accessLogs = accessResult.data ?? [];
  const invoices = invoicesResult.data ?? [];
  const communicationLogs = commLogsResult.data ?? [];
  const events = marketingEventsResult.data ?? [];
  const history = historyResult.data ?? [];

  return { supabase, warnings, since7, since30, profiles, subscriptions, accessLogs, invoices, communicationLogs, events, history, activeCampaigns: commCampaignsCount.count ?? 0, pendingJobs: queueCount.count ?? 0 };
}

function buildSegments(data: Awaited<ReturnType<typeof getBaseData>>) {
  const activeByUser = new Map<string, SubscriptionLite>();
  for (const sub of data.subscriptions) {
    if (!sub.user_id) continue;
    const current = activeByUser.get(sub.user_id);
    if (!current || new Date(sub.updated_at ?? 0) > new Date(current.updated_at ?? 0)) activeByUser.set(sub.user_id, sub);
  }

  const playByUser = new Map<string, number>();
  const blockByUser = new Map<string, number>();
  const lastActivityByUser = new Map<string, string>();
  for (const log of data.accessLogs) {
    const userId = log.user_id;
    if (!userId) continue;
    const status = normalize(log.status);
    if (status === "allowed") playByUser.set(userId, (playByUser.get(userId) ?? 0) + 1);
    if (status === "denied" || normalize(log.reason).includes("premium")) blockByUser.set(userId, (blockByUser.get(userId) ?? 0) + 1);
    const at = log.accessed_at ?? log.created_at;
    if (at && (!lastActivityByUser.get(userId) || new Date(at) > new Date(lastActivityByUser.get(userId)!))) lastActivityByUser.set(userId, at);
  }

  const failedPaymentUsers = new Set<string>();
  for (const invoice of data.invoices) {
    const failed = ["open", "uncollectible", "void", "payment_failed", "failed", "past_due"].includes(normalize(invoice.status)) && Number(invoice.amount_due_cents ?? 0) > 0;
    const id = invoice.user_id ?? invoice.profiles?.id ?? null;
    if (failed && id) failedPaymentUsers.add(id);
  }

  const allProfileIds = new Set(data.profiles.map((profile) => profile.id));
  const hotUpgrade = new Set<string>();
  const canceled = new Set<string>();
  const recovery = new Set<string>();
  const activeUsers = new Set<string>();
  const inactiveUsers = new Set<string>();
  const plusEngaged = new Set<string>();
  const premiumRisk = new Set<string>();
  const contentBlocked = new Set<string>();

  for (const profile of data.profiles) {
    const sub = activeByUser.get(profile.id);
    const plan = planSlug(sub);
    const status = normalize(sub?.status);
    const plays = playByUser.get(profile.id) ?? 0;
    const blocks = blockByUser.get(profile.id) ?? 0;
    const lastActivity = lastActivityByUser.get(profile.id) ?? profile.last_seen_at ?? null;
    const recent = Boolean(lastActivity && new Date(lastActivity).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (["free", "plus", ""].includes(plan) && (plays > 0 || blocks > 0) && recent) hotUpgrade.add(profile.id);
    if (status === "canceled" || status === "expired") canceled.add(profile.id);
    if (failedPaymentUsers.has(profile.id)) recovery.add(profile.id);
    if (recent) activeUsers.add(profile.id);
    else inactiveUsers.add(profile.id);
    if (plan === "plus" && recent && plays >= 2) plusEngaged.add(profile.id);
    if (plan === "premium" && !recent) premiumRisk.add(profile.id);
    if (blocks > 0) contentBlocked.add(profile.id);
  }

  const segments = [
    makeSegment("upgrade-quente", "Leads quentes para upgrade", "Upgrade", hotUpgrade, "Usuários Free/Plus com atividade recente ou bloqueio Premium.", "Plano Free/Plus + plays/bloqueios recentes", ["profiles", "subscriptions", "audio_access_logs"]),
    makeSegment("recuperacao-cancelados", "Cancelados para recuperação", "Recuperação", canceled, "Usuários que já tiveram plano e estão cancelados/expirados.", "subscription.status = canceled/expired", ["subscriptions"]),
    makeSegment("recuperacao-pagamento", "Pagamento falho", "Recuperação", recovery, "Usuários com fatura em aberto ou falha de pagamento.", "billing_invoices.status em falha + valor pendente", ["billing_invoices"]),
    makeSegment("engajamento-ativos", "Engajados últimos 30 dias", "Engajamento", activeUsers, "Usuários com atividade recente na plataforma.", "last_seen_at ou audio_access_logs nos últimos 30 dias", ["profiles", "audio_access_logs"]),
    makeSegment("engajamento-inativos", "Inativos para reativação", "Engajamento", inactiveUsers, "Usuários sem atividade recente.", "sem atividade nos últimos 30 dias", ["profiles", "audio_access_logs"]),
    makeSegment("plus-engajado", "Plus engajado", "Premium/Plus", plusEngaged, "Assinantes Plus com consumo recente relevante.", "plano Plus + 2+ plays recentes", ["subscriptions", "audio_access_logs"]),
    makeSegment("premium-risco", "Premium em risco", "Premium/Plus", premiumRisk, "Assinantes Premium sem atividade recente.", "plano Premium + inatividade", ["subscriptions", "profiles"]),
    makeSegment("conteudo-bloqueado", "Tentaram acessar kits bloqueados", "Conteúdo", contentBlocked, "Usuários que tentaram acessar conteúdo Premium/Plus bloqueado.", "audio_access_logs.status denied", ["audio_access_logs"]),
  ];

  return { segments, activeByUser, playByUser, blockByUser, lastActivityByUser, failedPaymentUsers };
}

function buildRecommended(segments: SmartSegment[]): RecommendedCampaign[] {
  const bySlug = new Map(segments.map((segment) => [segment.slug, segment.count]));
  const rows: Omit<RecommendedCampaign, "count" | "ctaHref">[] = [
    { slug: "converter-free-plus", title: "Converter Free para Plus", audience: "Leads quentes Free", reason: "Existe consumo real ou tentativa de acesso bloqueado, então a campanha pode usar dor concreta.", channel: "WhatsApp + E-mail", segmentSlug: "upgrade-quente" },
    { slug: "converter-plus-premium", title: "Converter Plus para Premium", audience: "Plus engajado", reason: "Assinantes Plus com recorrência podem perceber valor em biblioteca premium e prioridade de acesso.", channel: "WhatsApp", segmentSlug: "plus-engajado" },
    { slug: "recuperar-cancelados", title: "Recuperar cancelados", audience: "Cancelados/expirados", reason: "A assinatura já existiu; a campanha deve remover objeções e oferecer retorno claro.", channel: "E-mail", segmentSlug: "recuperacao-cancelados" },
    { slug: "recuperar-pagamento", title: "Recuperar pagamento falho", audience: "Pendentes/atrasados", reason: "Pagamento não confirmado exige comunicação operacional e link seguro de regularização.", channel: "WhatsApp + E-mail", segmentSlug: "recuperacao-pagamento" },
    { slug: "engajar-inativos", title: "Engajar usuários inativos", audience: "Sem atividade recente", reason: "Reativação com conteúdo útil pode reduzir abandono antes de uma oferta direta.", channel: "E-mail", segmentSlug: "engajamento-inativos" },
    { slug: "promover-kits-bloqueados", title: "Promover kits com bloqueios premium", audience: "Tentaram acessar kits bloqueados", reason: "O bloqueio indica intenção concreta; use o kit desejado como prova de valor.", channel: "WhatsApp", segmentSlug: "conteudo-bloqueado" },
  ];
  return rows.map((row) => ({ ...row, count: bySlug.get(row.segmentSlug) ?? 0, ctaHref: `/admin/comunicacao/campaigns?goal=${row.slug}&segment=${row.segmentSlug}` }));
}

function buildFunnel(history: HistoryLite[]): CommercialFunnelItem[] {
  const keyFor = (row: HistoryLite) => `${normalize(row.from_plan_slug) || "free"}->${normalize(row.to_plan_slug) || "free"}`;
  const counts = new Map<string, number>();
  const changeCounts = new Map<string, number>();
  for (const row of history) {
    counts.set(keyFor(row), (counts.get(keyFor(row)) ?? 0) + 1);
    const type = normalize(row.change_type);
    if (type) changeCounts.set(type, (changeCounts.get(type) ?? 0) + 1);
  }
  return [
    { label: "Free → Plus", count: counts.get("free->plus") ?? 0, hint: "Upgrades intermediários" },
    { label: "Free → Premium", count: counts.get("free->premium") ?? 0, hint: "Conversões diretas" },
    { label: "Plus → Premium", count: counts.get("plus->premium") ?? 0, hint: "Expansão de receita" },
    { label: "Premium → Plus", count: counts.get("premium->plus") ?? 0, hint: "Downgrades" },
    { label: "Premium → Free", count: counts.get("premium->free") ?? 0, hint: "Perda total de plano" },
    { label: "Cancelamentos", count: changeCounts.get("canceled") ?? 0, hint: "Eventos de cancelamento" },
    { label: "Renovações", count: changeCounts.get("renewed") ?? 0, hint: "Renovações registradas" },
    { label: "Pagamentos falhos", count: changeCounts.get("payment_failed") ?? 0, hint: "Falhas financeiras" },
  ];
}

export async function getCommunicationDashboard(): Promise<CommunicationDashboardData> {
  const data = await getBaseData();
  const segmentData = buildSegments(data);
  const logs = data.communicationLogs;
  const deliveries: DeliveryLite[] = [];
  const sent = logs.filter((d) => ["sent", "opened", "clicked", "replied"].includes(normalizeStatus(d.status ?? d.event))).length;
  const pending = data.pendingJobs + logs.filter((d) => normalizeStatus(d.status ?? d.event) === "queued").length;
  const failed = logs.filter((d) => normalizeStatus(d.status ?? d.level) === "failed" || normalize(d.level) === "error").length;
  const opened = logs.filter((d) => normalizeStatus(d.status ?? d.event) === "opened" || ["email_open", "email_opened"].includes(normalize(d.event))).length + data.events.filter((e) => ["open", "email_open", "email_opened"].includes(normalize(e.event_type))).length;
  const clicked = logs.filter((d) => normalizeStatus(d.status ?? d.event) === "clicked" || ["whatsapp_click", "link_clicked"].includes(normalize(d.event))).length + data.events.filter((e) => ["click", "whatsapp_click", "link_clicked"].includes(normalize(e.event_type))).length;
  const converted = data.events.filter((e) => ["subscription_created", "conversion", "checkout_completed"].includes(normalize(e.event_type))).length;
  const failureRate = safeRate(failed, Math.max(1, sent + pending + failed)) ?? 0;
  const healthScore = Math.max(0, Math.round(100 - failureRate - Math.min(25, pending / 20)));
  const healthTone = healthScore >= 85 ? "emerald" : healthScore >= 65 ? "amber" : "rose";

  return {
    contacts: data.profiles.length,
    activeCampaigns: data.activeCampaigns,
    sent,
    pending,
    failed,
    openRate: safeRate(opened, sent),
    ctr: safeRate(clicked, sent),
    conversion: safeRate(converted, sent),
    operationalHealth: { label: healthTone === "emerald" ? "Saudável" : healthTone === "amber" ? "Atenção" : "Crítico", score: healthScore, tone: healthTone },
    deliveries,
    segments: segmentData.segments,
    recommendedCampaigns: buildRecommended(segmentData.segments),
    funnel: buildFunnel(data.history),
    warnings: data.warnings,
  };
}

export async function getSmartSegments() {
  const data = await getBaseData();
  const segmentData = buildSegments(data);
  return { segments: segmentData.segments, recommendedCampaigns: buildRecommended(segmentData.segments), funnel: buildFunnel(data.history), warnings: data.warnings };
}

export async function getAudience(params: { search?: string; page?: number; limit?: number; status?: string; plan?: string }) {
  const data = await getBaseData();
  const segmentData = buildSegments(data);
  const search = normalize(params.search);
  const statusFilter = normalize(params.status);
  const planFilter = normalize(params.plan);
  let rows: AudienceRow[] = data.profiles.map((profile) => {
    const sub = segmentData.activeByUser.get(profile.id);
    const plays = segmentData.playByUser.get(profile.id) ?? 0;
    const blocks = segmentData.blockByUser.get(profile.id) ?? 0;
    const last = segmentData.lastActivityByUser.get(profile.id) ?? profile.last_seen_at ?? null;
    const current = currentPlanLabel(planSlug(sub));
    const commercial_status = commercialStatus({ subscription: sub, plays, blocks, lastActivity: last, failedPayment: segmentData.failedPaymentUsers.has(profile.id) });
    return {
      id: profile.id,
      full_name: profile.full_name ?? null,
      name: profile.full_name ?? null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      plano: current,
      status: sub?.status ?? null,
      whatsapp_opt_in: profile.whatsapp_opt_in ?? false,
      email_opt_in: profile.email_opt_in ?? false,
      last_seen_at: profile.last_seen_at ?? null,
      origin: profile.origin ?? null,
      created_at: profile.created_at ?? new Date(0).toISOString(),
      current_plan: current,
      commercial_status,
      recent_plays: plays,
      premium_blocks: blocks,
      last_activity_at: last,
    };
  });

  if (search) rows = rows.filter((row) => normalize(row.name).includes(search) || normalize(row.email).includes(search) || normalize(row.phone).includes(search));
  if (statusFilter) rows = rows.filter((row) => normalize(row.commercial_status).includes(statusFilter));
  if (planFilter) rows = rows.filter((row) => normalize(row.current_plan) === planFilter);

  const total = rows.length;
  const limit = Math.max(1, Math.min(params.limit ?? 25, 100));
  const page = Math.max(1, params.page ?? 1);
  const start = (page - 1) * limit;
  const paged = rows.slice(start, start + limit);
  const summary: AudienceSummary = {
    total,
    whatsappOptIn: rows.filter((r) => r.whatsapp_opt_in).length,
    emailOptIn: rows.filter((r) => r.email_opt_in).length,
    withPhone: rows.filter((r) => Boolean(r.phone)).length,
    withEmail: rows.filter((r) => Boolean(r.email)).length,
    active30d: rows.filter((r) => r.last_activity_at && new Date(r.last_activity_at).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000).length,
    commercialStatus: rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.commercial_status] = (acc[row.commercial_status] ?? 0) + 1;
      return acc;
    }, {}),
  };

  return { rows: paged, total, count: total, page, limit, summary, warnings: data.warnings };
}

export async function getCommunicationLogs(limit = 100): Promise<{ logs: CommunicationLogRow[]; warnings: CommunicationWarning[] }> {
  const supabase = createSupabaseAdminClient() as SupabaseAdmin & any;
  const warnings: CommunicationWarning[] = [];
  const { data, error } = await supabase
    .from("communication_logs")
    .select("id,campaign_id,user_id,channel,status,created_at,details,campaign:communication_campaigns(name),profile:profiles(full_name,email,phone)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { logs: [], warnings: [{ source: "communication_logs", message: error.message ?? "Consulta indisponível." }] };
  return { logs: (data ?? []) as CommunicationLogRow[], warnings };
}

export async function createCommunicationCampaign(input: Partial<CommunicationCampaign> & { audienceIds?: string[] }) {
  const supabase = createSupabaseAdminClient() as SupabaseAdmin & any;
  const { audienceIds = [], ...campaign } = input;
  const { data, error } = await supabase.from("communication_campaigns").insert(campaign).select("*").single();
  if (error) throw new Error(error.message);

  if (audienceIds.length) {
    const rows = audienceIds.map((user_id) => ({ campaign_id: data.id, user_id }));
    const { error: audienceError } = await supabase.from("communication_campaign_audience").insert(rows);
    if (audienceError) throw new Error(audienceError.message);
  }

  return data as CommunicationCampaign;
}

export async function enqueueCampaignAudience(campaignId: string, audienceIds: string[], channel: Channel, message: string, payload: Record<string, unknown> = {}) {
  const supabase = createSupabaseAdminClient() as SupabaseAdmin & any;
  if (!audienceIds.length) return { queued: 0 };

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id,full_name,email,phone").in("id", audienceIds);
  if (profilesError) throw new Error(profilesError.message);

  const rows = (profiles ?? []).map((profile: ProfileLite) => ({
    campaign_id: campaignId,
    user_id: profile.id,
    recipient_name: profile.full_name ?? null,
    recipient_email: profile.email ?? null,
    recipient_phone: profile.phone ?? null,
    channel,
    status: "pending",
    payload: { ...payload, message },
  }));

  const { error } = await supabase.from("communication_queue").insert(rows);
  if (error) throw new Error(error.message);
  return { queued: rows.length };
}
