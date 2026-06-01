import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock3, HeartPulse, Mail, MessageCircle, MousePointerClick, Send, ShieldCheck, Sparkles, Target, TrendingUp, Users, Workflow } from "lucide-react";

import { getCommunicationDashboard } from "@/lib/communication/service";

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "dados insuficientes" : `${value.toFixed(1).replace(".", ",")}%`;
}

function MetricCard({ title, value, caption, icon: Icon, tone = "cyan" }: { title: string; value: string | number; caption: string; icon: React.ComponentType<{ className?: string }>; tone?: "cyan" | "emerald" | "amber" | "rose" | "violet" }) {
  const tones = {
    cyan: "from-cyan-500/15 border-cyan-400/20",
    emerald: "from-emerald-500/15 border-emerald-400/20",
    amber: "from-amber-500/15 border-amber-400/20",
    rose: "from-rose-500/15 border-rose-400/20",
    violet: "from-violet-500/15 border-violet-400/20",
  };

  return (
    <article className={`rounded-3xl border bg-gradient-to-br ${tones[tone]} via-slate-950/85 to-slate-950 p-5 shadow-2xl shadow-black/20`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
        <Icon className="h-4 w-4 text-white/70" />
      </div>
      <p className="text-3xl font-semibold tracking-tight text-white">{typeof value === "number" ? formatNumber(value) : value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{caption}</p>
    </article>
  );
}

function RecommendedCampaignCard({ title, audience, reason, channel, count, href }: { title: string; audience: string; reason: string; channel: string; count: number; href: string }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">{audience}</span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">{formatNumber(count)} contatos</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{reason}</p>
      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">Canal sugerido: <span className="text-slate-200">{channel}</span></p>
      <Link href={href} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-100">
        Criar campanha <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

export async function DashboardCards() {
  const data = await getCommunicationDashboard();
  const whatsappSent = data.deliveries.filter((item) => item.channel === "whatsapp").length;
  const emailSent = data.deliveries.filter((item) => item.channel === "email").length;
  const healthIcon = data.operationalHealth.tone === "emerald" ? CheckCircle2 : data.operationalHealth.tone === "amber" ? Clock3 : AlertTriangle;

  return (
    <div className="space-y-6">
      {data.warnings.length ? (
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Dados parciais disponíveis</div>
          <p className="mt-1 text-amber-100/80">Algumas tabelas opcionais não responderam. A página continua operacional com fallback visual.</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.2em]">Ver fontes indisponíveis</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
              {data.warnings.slice(0, 6).map((warning) => <li key={`${warning.source}-${warning.message}`}>{warning.source}: {warning.message}</li>)}
            </ul>
          </details>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Contatos totais" value={data.contacts} caption="Base real em profiles" icon={Users} />
        <MetricCard title="Campanhas ativas" value={data.activeCampaigns} caption="Agendadas, em fila ou enviando" icon={Send} tone="violet" />
        <MetricCard title="Mensagens enviadas" value={data.sent} caption={`${whatsappSent} WhatsApp · ${emailSent} e-mail/logs`} icon={MessageCircle} tone="emerald" />
        <MetricCard title="Fila pendente" value={data.pending} caption="Jobs/logs aguardando processamento" icon={Clock3} tone={data.pending ? "amber" : "emerald"} />
        <MetricCard title="Falhas" value={data.failed} caption="Eventos/logs com erro" icon={AlertTriangle} tone={data.failed ? "rose" : "emerald"} />
        <MetricCard title="Open rate" value={formatPercent(data.openRate)} caption="Somente quando há eventos de abertura" icon={Mail} />
        <MetricCard title="CTR" value={formatPercent(data.ctr)} caption="Cliques rastreados em logs/eventos" icon={MousePointerClick} tone="amber" />
        <MetricCard title="Conversão" value={formatPercent(data.conversion)} caption="Eventos reais de conversão/assinatura" icon={TrendingUp} tone="emerald" />
        <MetricCard title="Saúde operacional" value={`${data.operationalHealth.score}/100`} caption={data.operationalHealth.label} icon={healthIcon} tone={data.operationalHealth.tone} />
        <MetricCard title="Segmentos úteis" value={data.segments.filter((segment) => segment.count > 0).length} caption="Públicos calculados com dados reais" icon={Target} tone="violet" />
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_32%),rgba(2,6,23,0.82)] p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Marketing Intelligence</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Painel executivo de comunicação</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A operação usa dados reais de perfis, assinaturas, acessos, invoices, histórico e logs. Métricas sem eventos suficientes aparecem explicitamente como dados insuficientes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/analytics" className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400/40 hover:bg-cyan-500/10">Analytics</Link>
            <Link href="/admin/assinaturas" className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400/40 hover:bg-cyan-500/10">Assinaturas</Link>
            <Link href="/admin/webhooks" className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400/40 hover:bg-cyan-500/10">Webhooks</Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {data.segments.slice(0, 6).map((segment) => (
            <Link key={segment.slug} href={segment.href} className="rounded-3xl border border-white/10 bg-slate-950/55 p-5 transition hover:border-cyan-400/30 hover:bg-cyan-500/10">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{segment.category}</span>
                <span className="text-xl font-bold text-white">{formatNumber(segment.count)}</span>
              </div>
              <h3 className="mt-3 font-semibold text-white">{segment.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{segment.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2 text-white"><Sparkles className="h-5 w-5 text-cyan-300" /><h2 className="text-xl font-semibold">Campanhas recomendadas</h2></div>
        <div className="grid gap-4 xl:grid-cols-3">
          {data.recommendedCampaigns.map((campaign) => <RecommendedCampaignCard key={campaign.slug} title={campaign.title} audience={campaign.audience} reason={campaign.reason} channel={campaign.channel} count={campaign.count} href={campaign.ctaHref} />)}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-2 text-white"><Workflow size={18} className="text-violet-300" /><h2 className="font-semibold">Funil comercial · últimos 30 dias</h2></div>
          <p className="mt-1 text-sm text-slate-500">Baseado em subscription_history quando a tabela existe. Valores zerados indicam ausência de evento registrado.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.funnel.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs text-slate-500">{item.hint}</p>
                <p className="mt-1 text-sm font-semibold text-slate-200">{item.label}</p>
                <p className="mt-2 text-2xl font-bold text-white">{formatNumber(item.count)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-2 text-emerald-100"><ShieldCheck size={18} /><h2 className="font-semibold">Envio seguro</h2></div>
          <p className="mt-3 text-sm leading-6 text-emerald-100/80">Campanhas não disparam mensagens no carregamento da página. O fluxo prepara payload padronizado, coloca mensagens em fila e registra logs. O envio real depende de canal/webhook configurado.</p>
          <Link href="/admin/comunicacao/settings" className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-emerald-300/25 px-4 py-2 text-sm font-semibold text-emerald-50 hover:bg-emerald-400/10">Configurar canais <ArrowRight className="h-4 w-4" /></Link>
        </section>
      </div>
    </div>
  );
}
