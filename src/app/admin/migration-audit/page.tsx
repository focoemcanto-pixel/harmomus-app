import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getMigrationReadinessAudit } from "@/lib/data/migration-audit";

function severityStyles(severity: string) {
  if (severity === "critical") {
    return {
      card: "border-rose-500/30 bg-rose-500/10",
      badge: "bg-rose-400 text-rose-950",
      text: "text-rose-100",
    };
  }

  if (severity === "warning") {
    return {
      card: "border-amber-400/30 bg-amber-400/10",
      badge: "bg-amber-300 text-amber-950",
      text: "text-amber-100",
    };
  }

  return {
    card: "border-emerald-400/30 bg-emerald-400/10",
    badge: "bg-emerald-300 text-emerald-950",
    text: "text-emerald-100",
  };
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-2 text-sm text-zinc-400">{hint}</p> : null}
    </div>
  );
}

export default async function MigrationAuditPage() {
  const context = await getCurrentUserAccessContext();

  if (!context.isAdmin) {
    redirect("/login");
  }

  const audit = await getMigrationReadinessAudit();

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Auditoria Harmomus</p>
              <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Prontidão de migração</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 md:text-base">
                Diagnóstico automático para decidir se a nova plataforma já pode receber usuários reais, assinaturas antigas e virada de domínio.
              </p>
            </div>

            <div className={`rounded-2xl border p-5 ${audit.isReady ? "border-emerald-400/40 bg-emerald-400/10" : "border-rose-400/40 bg-rose-400/10"}`}>
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Status geral</p>
              <p className={`mt-2 text-2xl font-bold ${audit.isReady ? "text-emerald-200" : "text-rose-200"}`}>
                {audit.isReady ? "Pronto para fase controlada" : "Ainda não migrar tudo"}
              </p>
              <p className="mt-2 text-sm text-zinc-300">
                {audit.criticalCount} crítica(s) · {audit.warningCount} alerta(s)
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          <StatCard label="Auth users" value={audit.totals.authUsers} />
          <StatCard label="Profiles" value={audit.totals.profiles} />
          <StatCard label="Subscriptions" value={audit.totals.subscriptions} />
          <StatCard label="Pagas" value={audit.totals.paidSubscriptions} />
          <StatCard label="Eventos Stripe" value={audit.totals.recentStripeEvents} hint="últimos 100" />
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Eventos Stripe recentes</h2>
              <p className="mt-1 text-sm text-zinc-400">Confirme se todos os eventos críticos estão chegando ao banco.</p>
            </div>
            <Link href="/admin" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-cyan-300 hover:text-cyan-100">
              Voltar ao admin
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {Object.entries(audit.recentStripeEventTypes).length ? (
              Object.entries(audit.recentStripeEventTypes).map(([eventType, count]) => (
                <div key={eventType} className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <p className="break-all text-sm font-medium text-zinc-200">{eventType}</p>
                  <p className="mt-2 text-2xl font-semibold text-cyan-200">{String(count)}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100 md:col-span-3">
                Nenhum evento Stripe recente encontrado. Teste o webhook antes de migrar assinantes pagos.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {audit.checks.map((check) => {
            const styles = severityStyles(check.severity);
            return (
              <article key={check.key} className={`rounded-3xl border p-6 ${styles.card}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${styles.badge}`}>
                        {check.severity === "critical" ? "Crítico" : check.severity === "warning" ? "Alerta" : "OK"}
                      </span>
                      <h3 className="text-xl font-semibold text-white">{check.label}</h3>
                    </div>
                    <p className={`mt-3 max-w-4xl text-sm leading-6 ${styles.text}`}>{check.description}</p>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                      <strong className="text-white">Ação recomendada:</strong> {check.action}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-center">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Ocorrências</p>
                    <p className="mt-1 text-3xl font-semibold text-white">{check.count}</p>
                  </div>
                </div>

                {check.samples?.length ? (
                  <details className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-100">Ver exemplos</summary>
                    <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-zinc-950 p-4 text-xs leading-5 text-zinc-300">
                      {formatJson(check.samples)}
                    </pre>
                  </details>
                ) : null}
              </article>
            );
          })}
        </section>

        <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-6">
          <h2 className="text-xl font-semibold text-cyan-100">Próximas ações</h2>
          <div className="mt-4 grid gap-3 text-sm text-cyan-50 md:grid-cols-2">
            <div className="rounded-2xl border border-cyan-300/20 bg-zinc-950/40 p-4">
              <p className="font-semibold">1. Corrigir críticos</p>
              <p className="mt-1 text-cyan-100/80">Não faça virada total com críticas abertas.</p>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-zinc-950/40 p-4">
              <p className="font-semibold">2. Testar eventos Stripe</p>
              <p className="mt-1 text-cyan-100/80">Checkout, renovação, falha, cancelamento e atualização.</p>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-zinc-950/40 p-4">
              <p className="font-semibold">3. Reconciliar pagos</p>
              <p className="mt-1 text-cyan-100/80">Todo pago precisa ter customer, subscription e próxima cobrança.</p>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-zinc-950/40 p-4">
              <p className="font-semibold">4. Migrar em fase controlada</p>
              <p className="mt-1 text-cyan-100/80">Primeiro free/novos, depois assinantes antigos.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
