import { Activity, ArrowRightLeft, BadgeCheck, ChartNoAxesCombined, RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";

const stats = [
  { label: "MRR estimado", value: "R$ 38.900", detail: "+8.4% no mês", icon: ChartNoAxesCombined, glow: "from-gold-500/20 via-gold-300/5" },
  { label: "Assinantes ativos", value: "1.284", detail: "92 novos em 30 dias", icon: Users, glow: "from-cyan-500/20 via-cyan-300/5" },
  { label: "Conversão Free → Premium", value: "7,2%", detail: "meta 8%", icon: ArrowRightLeft, glow: "from-violet-500/20 via-violet-300/5" },
  { label: "Status Stripe", value: "Operacional", detail: "sem incidentes", icon: ShieldCheck, glow: "from-emerald-500/20 via-emerald-300/5" },
];

const permissions = [
  { feature: "Playlists", free: true, plus: true, premium: true },
  { feature: "Troca de tons", free: false, plus: true, premium: true },
  { feature: "Solicitar músicas", free: false, plus: true, premium: true },
  { feature: "Kits premium", free: false, plus: false, premium: true },
];

const recentActivity = [
  { user: "Renatha Santos", plan: "Premium", gateway: "manual_migration", status: "Ativo" },
  { user: "Sarah Spindola", plan: "Premium", gateway: "stripe", status: "Falha pagamento" },
  { user: "Lucas Ferreira", plan: "Plus", gateway: "stripe", status: "Ativo" },
];

export default function BillingPage() {
  return (
    <section className="space-y-6">
      <PageHeader title="Billing" description="Visão administrativa de assinaturas, cobrança e gateways." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, detail, icon: Icon, glow }) => (
          <article
            key={label}
            className={`rounded-2xl border border-white/10 bg-gradient-to-br ${glow} to-surface/80 p-5 shadow-premium backdrop-blur`}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
              <Icon className="h-4 w-4 text-gold-300" />
            </div>
            <p className="text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-muted">{detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Controle de acesso dos planos</h2>
            <button className="rounded-xl border border-gold-400/40 bg-gold-500/10 px-3 py-1.5 text-xs font-medium text-gold-200 transition hover:bg-gold-500/20">
              Editar permissões
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 font-medium">Recurso</th>
                  <th className="px-3 py-2 font-medium">Free</th>
                  <th className="px-3 py-2 font-medium">Plus</th>
                  <th className="px-3 py-2 font-medium">Premium</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((item) => (
                  <tr key={item.feature} className="border-b border-white/5 text-muted last:border-none">
                    <td className="px-3 py-3 text-white">{item.feature}</td>
                    {[item.free, item.plus, item.premium].map((enabled, idx) => (
                      <td key={`${item.feature}-${idx}`} className="px-3 py-3">
                        <span
                          className={`inline-flex min-w-8 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-zinc-400"
                          }`}
                        >
                          {enabled ? "✓" : "—"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
          <h2 className="mb-4 text-base font-semibold text-white">Stripe Control Center</h2>
          <div className="space-y-3">
            <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-sm text-cyan-100">
              <p className="font-medium">Stripe conectado</p>
              <p className="text-xs text-cyan-100/70">Conta principal ativa.</p>
            </div>
            <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-3 text-sm text-violet-100">
              <p className="font-medium">Webhook ativo</p>
              <p className="text-xs text-violet-100/70">Endpoint recebendo eventos.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-[#101827] p-3">
                <p className="text-xs text-muted">Último sync</p>
                <p className="text-sm font-semibold text-white">há 4 min</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#101827] p-3">
                <p className="text-xs text-muted">Eventos falhos</p>
                <p className="text-sm font-semibold text-white">2</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Activity className="h-4 w-4 text-violet-300" />
            Migração e atividade recente
          </h2>
          <button className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20">
            <Sparkles className="h-3.5 w-3.5" />
            Abrir central Stripe
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">Plano</th>
                <th className="px-3 py-2 font-medium">Gateway</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((item) => (
                <tr key={item.user} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3 text-white">{item.user}</td>
                  <td className="px-3 py-3 text-muted">{item.plan}</td>
                  <td className="px-3 py-3 text-muted">{item.gateway}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                        item.status === "Ativo" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                      }`}
                    >
                      {item.status === "Ativo" ? <BadgeCheck className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
