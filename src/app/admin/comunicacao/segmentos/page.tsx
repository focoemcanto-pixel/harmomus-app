import Link from "next/link";
import { ArrowLeft, ArrowRight, DatabaseZap, Sparkles, Users, Workflow } from "lucide-react";

import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { getSmartSegments } from "@/lib/communication/service";

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export default async function Page() {
  const { segments, recommendedCampaigns, funnel, warnings } = await getSmartSegments();

  return (
    <CommunicationShell title="Segmentos Inteligentes" subtitle="Públicos calculados com dados reais para campanhas comerciais seguras.">
      <div className="space-y-6">
        <Link href="/admin/comunicacao/dashboard" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400/30 hover:bg-cyan-500/10"><ArrowLeft size={16} /> Voltar ao dashboard</Link>

        {warnings.length ? (
          <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            Dados parciais: {warnings.map((warning) => warning.source).join(", ")}. As páginas usam fallback e não quebram quando uma tabela opcional não existe.
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {segments.map((segment) => (
            <article key={segment.slug} className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-950/90 to-slate-900 p-5 shadow-2xl shadow-black/20">
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">{segment.category}</span>
                <span className="text-3xl font-bold text-white">{formatNumber(segment.count)}</span>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-white">{segment.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{segment.description}</p>
              <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                <summary className="cursor-pointer font-semibold text-slate-100">Regra e fontes</summary>
                <p className="mt-2 leading-5">{segment.rule}</p>
                <p className="mt-2 text-slate-500">Fontes: {segment.sources.join(", ") || "dados insuficientes"}</p>
              </details>
              <Link href={segment.href} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400/30 hover:bg-cyan-500/10">Criar campanha <ArrowRight size={16} /></Link>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-2 text-white"><Sparkles size={18} className="text-violet-300" /><h2 className="font-semibold">Campanhas recomendadas por objetivo</h2></div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {recommendedCampaigns.map((campaign) => (
              <article key={campaign.slug} className="rounded-3xl border border-white/10 bg-slate-900/50 p-5">
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{formatNumber(campaign.count)} no segmento</span>
                <h3 className="mt-4 font-semibold text-white">{campaign.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400"><strong className="text-slate-200">Público:</strong> {campaign.audience}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400"><strong className="text-slate-200">Motivo:</strong> {campaign.reason}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400"><strong className="text-slate-200">Canal:</strong> {campaign.channel}</p>
                <Link href={campaign.ctaHref} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">Criar campanha</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-2 text-white"><Workflow size={18} className="text-cyan-300" /><h2 className="font-semibold">Funil comercial</h2></div>
          <p className="mt-1 text-sm text-slate-500">Usa subscription_history quando disponível; em ambiente sem tabela, os valores ficam zerados e um aviso é exibido.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {funnel.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2 text-slate-300"><DatabaseZap size={15} /><span className="text-xs">{item.hint}</span></div>
                <p className="mt-2 font-semibold text-white">{item.label}</p>
                <p className="mt-2 text-2xl font-bold text-white">{formatNumber(item.count)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </CommunicationShell>
  );
}
