import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, Siren } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { getMemberOperationalSummaries, getMembers } from "@/lib/data/members";
import { calculateMemberHealth, getMemberDiagnosis, getOperationalFlags, getRecommendedActions } from "@/lib/member-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function severityClass(severity: "success" | "info" | "warning" | "critical") {
  if (severity === "success") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (severity === "info") return "border-sky-400/40 bg-sky-500/10 text-sky-200";
  if (severity === "warning") return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  return "border-red-400/40 bg-red-500/10 text-red-200";
}

function flagLabel(flag: string) {
  const labels: Record<string, string> = {
    pending: "Pending",
    no_login: "Sem login",
    no_stripe_subscription: "Sem sub Stripe",
    failed_communication: "Falha comunicação",
    no_kit_access: "Sem kit",
    no_audio_access: "Sem áudio",
    migrated_from_pms: "PMS",
    healthy: "Saudável",
    critical: "Crítico",
  };
  return labels[flag] ?? flag;
}

const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 } as const;

export default async function AdminIncidentesPage() {
  const members = (await getMembers()).slice(0, 100);
  const summaries = await getMemberOperationalSummaries(members, { limit: 100 });

  const incidents = members
    .map((member) => {
      const journey = summaries.get(member.profile.id) ?? null;
      const health = calculateMemberHealth(member, journey);
      const flags = getOperationalFlags(member, journey);
      const diagnosis = getMemberDiagnosis(member, journey);
      const mainAction = getRecommendedActions(member, journey)[0] ?? null;
      const isActive = ["active", "trialing"].includes(normalize(member.subscription?.status));
      const hasIncident =
        health.score < 70 ||
        normalize(member.subscription?.status) === "pending" ||
        flags.includes("no_stripe_subscription") ||
        flags.includes("no_login") ||
        flags.includes("failed_communication") ||
        (isActive && flags.includes("no_kit_access"));

      return { member, health, flags, diagnosis, mainAction, hasIncident };
    })
    .filter((item) => item.hasIncident)
    .sort((a, b) => {
      const bySeverity = severityOrder[a.health.severity] - severityOrder[b.health.severity];
      if (bySeverity !== 0) return bySeverity;
      return new Date(b.member.profile.created_at ?? 0).getTime() - new Date(a.member.profile.created_at ?? 0).getTime();
    });

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader title="Incidentes Operacionais" description="Fila visual de membros com risco, pendências de acesso, Stripe ou comunicação. Esta página não executa ações automáticas." />
        <Link href="/admin/membros" className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10">
          Ver membros <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.22em] text-red-200/80">Críticos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{incidents.filter((item) => item.health.severity === "critical").length}</p>
        </article>
        <article className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-200/80">Risco</p>
          <p className="mt-2 text-3xl font-semibold text-white">{incidents.filter((item) => item.health.severity === "warning").length}</p>
        </article>
        <article className="rounded-3xl border border-sky-400/30 bg-sky-500/10 p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.22em] text-sky-200/80">Atenção</p>
          <p className="mt-2 text-3xl font-semibold text-white">{incidents.filter((item) => item.health.severity === "info").length}</p>
        </article>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
        <div className="border-b border-border/70 bg-gradient-to-br from-surface-muted to-background p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl border border-red-400/30 bg-red-500/10 p-2 text-red-200"><Siren className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-semibold text-white">Fila inicial de incidentes</h2>
              <p className="text-sm text-muted">Limitada aos 100 membros mais recentes para evitar consultas pesadas.</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border/70">
                <th className="p-4 font-medium">Membro</th>
                <th className="font-medium">Plano</th>
                <th className="font-medium">Status</th>
                <th className="font-medium">Score de saúde</th>
                <th className="font-medium">Problema principal</th>
                <th className="font-medium">Ação recomendada principal</th>
                <th className="font-medium">Jornada</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(({ member, health, flags, diagnosis, mainAction }) => (
                <tr key={member.profile.id} className="border-b border-border/60 last:border-none hover:bg-white/[0.02]">
                  <td className="p-4 align-top">
                    <p className="font-medium text-white">{member.profile.full_name ?? "Sem nome"}</p>
                    <p className="mt-1 text-xs text-muted">{member.profile.email ?? "Sem e-mail"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {flags.slice(0, 3).map((flag) => <span key={flag} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300">{flagLabel(flag)}</span>)}
                    </div>
                  </td>
                  <td className="align-top text-zinc-200">{member.plan?.name ?? "Sem plano"}</td>
                  <td className="align-top text-muted">{member.subscription?.status ?? "none"}</td>
                  <td className="align-top">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${severityClass(health.severity)}`}>
                      {health.severity === "success" ? <BadgeCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      {health.score}/100 · {health.label}
                    </span>
                  </td>
                  <td className="align-top">
                    <p className="max-w-[260px] font-medium text-white">{diagnosis.title}</p>
                    <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-muted">{diagnosis.cause}</p>
                  </td>
                  <td className="align-top">
                    <p className="max-w-[260px] font-medium text-white">{mainAction?.label ?? "Revisar manualmente"}</p>
                    <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-muted">{mainAction?.description ?? diagnosis.action}</p>
                  </td>
                  <td className="align-top">
                    <Link href={`/admin/membros/${member.profile.id}`} className="inline-flex items-center gap-2 rounded-xl border border-gold-400/30 bg-gold-500/10 px-3 py-2 text-xs font-medium text-gold-200 transition hover:bg-gold-500/20">
                      Abrir jornada <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
              {!incidents.length ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted">Nenhum incidente operacional encontrado na amostra atual.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
