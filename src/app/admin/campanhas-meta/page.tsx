import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER_EMAILS = new Set(["markuezemarquinhos@hotmail.com", "markuezemarquinhos@gmail.com"]);
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function cleanLabel(value?: string | null, fallback = "Não identificado") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function planPrice(slug?: string | null) {
  if (slug === "plus") return 19.9;
  if (slug === "premium") return 39.9;
  if (slug === "ministry_10") return 397;
  if (slug === "ministry_20") return 697;
  if (slug === "ministry_40") return 1297;
  if (slug?.startsWith("ministry")) return 397;
  return 0;
}

function planName(slug?: string | null) {
  if (slug === "plus") return "Plus";
  if (slug === "premium") return "Premium";
  if (slug?.startsWith("ministry")) return "Ministerial";
  return "Sem plano";
}

function safeDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

type SubscriptionRow = {
  id: string;
  status: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  created_at: string | null;
  updated_at: string | null;
  profiles?: { email: string | null; full_name?: string | null } | null;
  plans?: { slug: string | null; name?: string | null } | null;
};

type CampaignSummary = {
  key: string;
  campaign: string;
  source: string;
  medium: string;
  subscribers: number;
  active: number;
  premium: number;
  plus: number;
  mrr: number;
  lastAt: string | null;
};

function aggregateCampaigns(rows: SubscriptionRow[]) {
  const map = new Map<string, CampaignSummary>();

  for (const row of rows) {
    const source = cleanLabel(row.utm_source, "sem origem").toLowerCase();
    const campaign = cleanLabel(row.utm_campaign, "sem campanha");
    const medium = cleanLabel(row.utm_medium, "sem mídia");
    const key = `${source}::${medium}::${campaign}`;
    const planSlug = row.plans?.slug ?? null;
    const active = ACTIVE_STATUSES.has(String(row.status ?? ""));

    const current = map.get(key) ?? {
      key,
      campaign,
      source,
      medium,
      subscribers: 0,
      active: 0,
      premium: 0,
      plus: 0,
      mrr: 0,
      lastAt: null,
    };

    current.subscribers += 1;
    if (active) {
      current.active += 1;
      current.mrr += planPrice(planSlug);
    }
    if (planSlug === "premium") current.premium += 1;
    if (planSlug === "plus") current.plus += 1;
    if (!current.lastAt || (row.created_at && row.created_at > current.lastAt)) current.lastAt = row.created_at;
    map.set(key, current);
  }

  return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr || b.active - a.active || b.subscribers - a.subscribers);
}

function MetricCard({ title, value, caption, tone = "cyan" }: { title: string; value: string; caption: string; tone?: "cyan" | "emerald" | "amber" | "violet" }) {
  const tones = {
    cyan: "from-cyan-500/15 via-zinc-950/75 to-blue-500/10 border-cyan-400/20",
    emerald: "from-emerald-500/15 via-zinc-950/75 to-cyan-500/10 border-emerald-400/20",
    amber: "from-amber-500/15 via-zinc-950/75 to-zinc-950/80 border-amber-400/20",
    violet: "from-violet-500/15 via-zinc-950/75 to-fuchsia-500/10 border-violet-400/20",
  };

  return (
    <div className={`rounded-3xl border bg-gradient-to-br ${tones[tone]} p-5 shadow-2xl shadow-black/20`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{caption}</p>
    </div>
  );
}

function SourcePill({ source }: { source: string }) {
  const normalized = source.toLowerCase();
  const label = normalized.includes("facebook") || normalized.includes("meta") || normalized.includes("instagram") ? "Meta" : source;
  return <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-100">{label}</span>;
}

export default async function CampanhasMetaPage() {
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id,status,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,gclid,created_at,updated_at,profiles(email,full_name),plans(slug,name)")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = ((data ?? []) as SubscriptionRow[]).filter((row) => !OWNER_EMAILS.has(String(row.profiles?.email ?? "").toLowerCase()));
  const attributedRows = rows.filter((row) => row.utm_source || row.utm_campaign || row.fbclid || row.gclid);
  const metaRows = attributedRows.filter((row) => {
    const source = String(row.utm_source ?? "").toLowerCase();
    return source.includes("facebook") || source.includes("meta") || source.includes("instagram") || Boolean(row.fbclid);
  });

  const campaigns = aggregateCampaigns(metaRows.length ? metaRows : attributedRows);
  const activeRows = rows.filter((row) => ACTIVE_STATUSES.has(String(row.status ?? "")));
  const activeAttributedRows = attributedRows.filter((row) => ACTIVE_STATUSES.has(String(row.status ?? "")));
  const mrrAttributed = activeAttributedRows.reduce((sum, row) => sum + planPrice(row.plans?.slug), 0);
  const mrrMeta = metaRows.filter((row) => ACTIVE_STATUSES.has(String(row.status ?? ""))).reduce((sum, row) => sum + planPrice(row.plans?.slug), 0);
  const premiumMeta = metaRows.filter((row) => row.plans?.slug === "premium" && ACTIVE_STATUSES.has(String(row.status ?? ""))).length;
  const attributionRate = rows.length ? Math.round((attributedRows.length / rows.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Campanhas Meta" description="Receita, assinantes e origem das vendas por UTM. Base preparada para leitura de tráfego pago e otimização por Purchase Premium." />

      {error ? (
        <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-100">Erro ao carregar campanhas: {error.message}</div>
      ) : null}

      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.14),transparent_34%),rgba(9,9,11,0.82)] p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Meta Growth Center</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Painel de campanhas e assinatura</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Acompanha assinaturas com origem rastreada por UTM/fbclid. Os valores são MRR estimado pelos planos atuais e excluem contas owner/teste.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/billing" className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20">Ver Billing</Link>
            <Link href="/admin/membros" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/10">Ver membros</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="MRR atribuído" value={formatCurrency(mrrAttributed)} caption={`${formatNumber(activeAttributedRows.length)} assinantes ativos com UTM`} tone="emerald" />
        <MetricCard title="MRR Meta" value={formatCurrency(mrrMeta)} caption={`${formatNumber(metaRows.length)} registros com origem Meta/fbclid`} tone="cyan" />
        <MetricCard title="Premium Meta" value={formatNumber(premiumMeta)} caption="Assinantes Premium ativos atribuídos à Meta" tone="violet" />
        <MetricCard title="Cobertura UTM" value={`${attributionRate}%`} caption={`${formatNumber(attributedRows.length)} de ${formatNumber(rows.length)} assinaturas rastreadas`} tone="amber" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.5fr_0.8fr]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/65 shadow-2xl shadow-black/25">
          <div className="border-b border-white/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/70">Ranking</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Campanhas por MRR</h2>
            <p className="mt-1 text-sm text-zinc-500">Agrupamento por utm_source + utm_medium + utm_campaign.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500">
                <tr>
                  <th className="px-5 py-4">Campanha</th>
                  <th className="px-5 py-4">Origem</th>
                  <th className="px-5 py-4">Assinantes</th>
                  <th className="px-5 py-4">Premium</th>
                  <th className="px-5 py-4">Plus</th>
                  <th className="px-5 py-4">MRR</th>
                  <th className="px-5 py-4">Última venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {campaigns.length ? campaigns.map((campaign) => (
                  <tr key={campaign.key} className="text-zinc-300 transition hover:bg-white/[0.03]">
                    <td className="max-w-[280px] px-5 py-4">
                      <p className="truncate font-semibold text-white">{campaign.campaign}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">{campaign.medium}</p>
                    </td>
                    <td className="px-5 py-4"><SourcePill source={campaign.source} /></td>
                    <td className="px-5 py-4">{formatNumber(campaign.active)} ativos <span className="text-zinc-600">/ {formatNumber(campaign.subscribers)} total</span></td>
                    <td className="px-5 py-4 text-violet-100">{formatNumber(campaign.premium)}</td>
                    <td className="px-5 py-4 text-cyan-100">{formatNumber(campaign.plus)}</td>
                    <td className="px-5 py-4 font-semibold text-emerald-200">{formatCurrency(campaign.mrr)}</td>
                    <td className="px-5 py-4 text-zinc-500">{safeDate(campaign.lastAt)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-zinc-500">Ainda não há vendas atribuídas por UTM. As próximas assinaturas vindas das campanhas aparecerão aqui.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-zinc-950/65 p-5 shadow-2xl shadow-black/20">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Diagnóstico</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Prontidão para tráfego</h3>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-emerald-100"><span>Pixel Purchase Premium</span><span>Ativo</span></div>
              <div className="flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-emerald-100"><span>Stripe metadata</span><span>Ativo</span></div>
              <div className="flex items-center justify-between rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-cyan-100"><span>UTM no banco</span><span>{attributedRows.length ? "Recebendo" : "Aguardando"}</span></div>
              <div className="flex items-center justify-between rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-amber-100"><span>API Meta Ads</span><span>Manual</span></div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-zinc-950/65 p-5 shadow-2xl shadow-black/20">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/70">Próxima evolução</p>
            <h3 className="mt-1 text-lg font-semibold text-white">ROAS automático</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Para calcular CAC e ROAS real, conectaremos custos da campanha via Meta Marketing API ou importação manual diária. Até lá, este painel mostra receita e assinaturas atribuídas.</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/65 shadow-2xl shadow-black/25">
        <div className="border-b border-white/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/70">Últimas assinaturas rastreadas</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Jornada de conversão</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500">
              <tr>
                <th className="px-5 py-4">Cliente</th>
                <th className="px-5 py-4">Plano</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Origem</th>
                <th className="px-5 py-4">Campanha</th>
                <th className="px-5 py-4">Conteúdo</th>
                <th className="px-5 py-4">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {attributedRows.slice(0, 25).map((row) => (
                <tr key={row.id} className="text-zinc-300 transition hover:bg-white/[0.03]">
                  <td className="px-5 py-4">
                    <p className="font-medium text-white">{row.profiles?.full_name || "Sem nome"}</p>
                    <p className="mt-1 text-xs text-zinc-500">{row.profiles?.email ?? "-"}</p>
                  </td>
                  <td className="px-5 py-4">{planName(row.plans?.slug)}</td>
                  <td className="px-5 py-4"><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200">{row.status ?? "-"}</span></td>
                  <td className="px-5 py-4">{cleanLabel(row.utm_source, row.fbclid ? "facebook/fbclid" : "-")}</td>
                  <td className="max-w-[260px] px-5 py-4"><span className="block truncate">{cleanLabel(row.utm_campaign, "-")}</span></td>
                  <td className="max-w-[220px] px-5 py-4"><span className="block truncate text-zinc-500">{cleanLabel(row.utm_content, "-")}</span></td>
                  <td className="px-5 py-4 text-zinc-500">{safeDate(row.created_at)}</td>
                </tr>
              ))}
              {!attributedRows.length ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-zinc-500">Nenhuma assinatura rastreada ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
