import Link from "next/link";
import { ArrowRight, Bot, Flame, Mail, MessageCircle, MousePointerClick, Send, ShieldAlert, Sparkles, Target, TrendingUp, Users } from "lucide-react";

import { getCommunicationDashboard, getPendingQueue } from "@/lib/communication/service";

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function MetricCard({ title, value, caption, icon: Icon, tone = "cyan" }: { title: string; value: string | number; caption: string; icon: any; tone?: "cyan" | "emerald" | "amber" | "rose" | "violet" }) {
  const tones = {
    cyan: "from-cyan-500/15 via-slate-950/80 to-slate-950 border-cyan-400/20",
    emerald: "from-emerald-500/15 via-slate-950/80 to-slate-950 border-emerald-400/20",
    amber: "from-amber-500/15 via-slate-950/80 to-slate-950 border-amber-400/20",
    rose: "from-rose-500/15 via-slate-950/80 to-slate-950 border-rose-400/20",
    violet: "from-violet-500/15 via-slate-950/80 to-slate-950 border-violet-400/20",
  };

  return (
    <article className={`rounded-3xl border bg-gradient-to-br ${tones[tone]} p-5 shadow-2xl shadow-black/20`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
        <Icon className="h-4 w-4 text-white/70" />
      </div>
      <p className="text-3xl font-semibold tracking-tight text-white">{typeof value === "number" ? formatNumber(value) : value}</p>
      <p className="mt-1 text-xs text-slate-500">{caption}</p>
    </article>
  );
}

function RecommendedCampaign({ title, audience, message, href, tone = "cyan" }: { title: string; audience: string; message: string; href: string; tone?: "cyan" | "amber" | "rose" | "violet" }) {
  const tones = {
    cyan: "border-cyan-400/20 bg-cyan-500/10 text-cyan-100",
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-100",
    rose: "border-rose-400/20 bg-rose-500/10 text-rose-100",
    violet: "border-violet-400/20 bg-violet-500/10 text-violet-100",
  };

  return (
    <article className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-2xl shadow-black/20">
      <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${tones[tone]}`}>{audience}</span>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{message}</p>
      <Link href={href} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-100">
        Preparar campanha <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

export async function DashboardCards() {
  const [data, queue] = await Promise.all([getCommunicationDashboard(), getPendingQueue(8)]);

  const failed = data.deliveries.filter((item) => String(item.status ?? "").toLowerCase().includes("fail") || String(item.status ?? "").toLowerCase().includes("erro")).length;
  const whatsappSent = data.deliveries.filter((item) => item.channel === "whatsapp").length;
  const emailSent = data.deliveries.filter((item) => item.channel === "email").length;
  const healthTone = failed > 0 ? "rose" : queue.length > 0 ? "amber" : "emerald";

  const campaigns = [
    {
      title: "Converter leads quentes do Upgrade Center",
      audience: "Free/Plus com bloqueio premium",
      message: "Use os usuários que tentaram consumir conteúdo travado para apresentar Plus ou Premium no momento certo.",
      href: "/admin/assinaturas",
      tone: "amber" as const,
    },
    {
      title: "Recuperar assinantes em risco",
      audience: "Atrasados, pendentes e cancelados",
      message: "Crie uma mensagem direta para recuperar pagamento, renovar interesse ou oferecer retorno ao plano.",
      href: "/admin/assinaturas",
      tone: "rose" as const,
    },
    {
      title: "Campanha por kit com alto desejo",
      audience: "Bloqueios Premium no Analytics",
      message: "Transforme kits que mais batem no bloqueio em campanhas de upgrade com prova de valor.",
      href: "/admin/analytics",
      tone: "violet" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Contatos" value={data.contacts} caption="Base total no CRM" icon={Users} />
        <MetricCard title="Campanhas" value={data.activeCampaigns} caption="Ativas ou em processamento" icon={Send} tone="violet" />
        <MetricCard title="Entregas" value={data.sent} caption={`${whatsappSent} WhatsApp · ${emailSent} e-mail`} icon={MessageCircle} tone="emerald" />
        <MetricCard title="Open rate" value={formatPercent(data.openRate)} caption="Eventos de abertura" icon={Mail} />
        <MetricCard title="CTR" value={formatPercent(data.ctr)} caption="Cliques rastreados" icon={MousePointerClick} tone="amber" />
        <MetricCard title="Conversão" value={formatPercent(data.conversion)} caption="Eventos de assinatura/conversão" icon={TrendingUp} tone="emerald" />
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_34%),rgba(2,6,23,0.78)] p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Marketing Intelligence</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Painel de crescimento</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A Central de Comunicação agora conecta campanhas com Analytics, Assinaturas, Webhooks e LabMessage. A decisão principal é: para quem mandar, com qual objetivo e por qual canal.</p>
          </div>
          <Link href="/admin/comunicacao/campaigns" className="inline-flex items-center gap-2 rounded-2xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-500">
            Nova campanha <Sparkles className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Flame className="h-4 w-4 text-amber-300" /> Leads quentes</div>
            <p className="mt-2 text-sm text-slate-400">Puxe da Central de Assinaturas usuários com plays, bloqueios e sinal de upgrade.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Target className="h-4 w-4 text-violet-300" /> Segmentos claros</div>
            <p className="mt-2 text-sm text-slate-400">Free ativo, Plus engajado, Premium em risco, cancelados e bloqueios por kit.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Bot className="h-4 w-4 text-cyan-300" /> Automação pronta</div>
            <p className="mt-2 text-sm text-slate-400">Use os webhooks e a fila para campanhas por evento sem expor detalhes técnicos.</p>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Campanhas recomendadas</h2>
            <p className="mt-1 text-sm text-slate-500">Atalhos estratégicos baseados nos módulos que já estruturamos.</p>
          </div>
          <Link href="/admin/comunicacao/templates" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">Ver templates <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          {campaigns.map((campaign) => <RecommendedCampaign key={campaign.title} {...campaign} />)}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-2xl shadow-black/20">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><ShieldAlert className="h-4 w-4 text-amber-300" /> Saúde operacional</h2>
          <p className="mt-1 text-sm text-slate-500">Fila e falhas recentes da comunicação.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-xs text-slate-500">Na fila</p><p className="mt-2 text-2xl font-semibold text-white">{queue.length}</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-xs text-slate-500">Falhas</p><p className="mt-2 text-2xl font-semibold text-white">{failed}</p></div>
            <div className={`rounded-2xl border p-4 ${healthTone === "rose" ? "border-rose-400/25 bg-rose-500/10" : healthTone === "amber" ? "border-amber-400/25 bg-amber-500/10" : "border-emerald-400/25 bg-emerald-500/10"}`}><p className="text-xs text-slate-300/70">Status</p><p className="mt-2 text-2xl font-semibold text-white">{failed > 0 ? "Atenção" : queue.length > 0 ? "Fila ativa" : "Saudável"}</p></div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-2xl shadow-black/20">
          <h2 className="text-lg font-semibold text-white">Próximas entregas</h2>
          <p className="mt-1 text-sm text-slate-500">Itens aguardando processamento.</p>
          <div className="mt-5 space-y-2">
            {queue.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">Nenhum item pendente.</div> : null}
            {queue.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white">{item.channel}</span>
                  <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-100">{item.status}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{String((item.payload as any)?.campaign_name ?? (item.payload as any)?.recipient ?? item.delivery_id)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
