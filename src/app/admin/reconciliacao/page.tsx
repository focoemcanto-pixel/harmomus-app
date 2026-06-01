import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, Clock, CreditCard, SearchCheck } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { getMemberOperationalSummaries, getMembers } from "@/lib/data/members";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { calculateMemberHealth, getMemberDiagnosis, getOperationalFlags, getRecommendedActions } from "@/lib/member-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Severity = "critical" | "warning" | "info";

type ReconciliationIssue = {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  action: string;
  memberName: string;
  memberEmail: string;
  planName: string;
  status: string;
  score: number;
  evidence: string[];
  href: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isPresent(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function minutesSince(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 60000);
}

function severityClass(severity: Severity) {
  if (severity === "critical") return "border-red-400/40 bg-red-500/10 text-red-200";
  if (severity === "warning") return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  return "border-sky-400/40 bg-sky-500/10 text-sky-200";
}

function severityOrder(severity: Severity) {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function getStripeCustomer(subscription: any) {
  return subscription?.stripe_customer_id ?? subscription?.gateway_customer_id ?? null;
}

function getStripeSubscription(subscription: any) {
  return subscription?.stripe_subscription_id ?? subscription?.gateway_subscription_id ?? null;
}

function isMigrated(member: Awaited<ReturnType<typeof getMembers>>[number]) {
  const profile: any = member.profile;
  const subscription: any = member.subscription;
  return Boolean(
    profile?.migrated_from_pms ||
      profile?.legacy_pms_member_id ||
      subscription?.migrated_from_pms ||
      subscription?.legacy_pms_subscription_id ||
      normalize(subscription?.original_gateway) === "pms" ||
      normalize(subscription?.gateway) === "pms",
  );
}

function buildIssueBase(member: Awaited<ReturnType<typeof getMembers>>[number], score: number) {
  return {
    memberName: member.profile.full_name ?? "Sem nome",
    memberEmail: member.profile.email ?? "Sem e-mail",
    planName: member.plan?.name ?? "Sem plano",
    status: member.subscription?.status ?? "none",
    score,
    href: `/admin/membros/${member.profile.id}`,
    createdAt: member.subscription?.created_at ?? member.profile.created_at,
    updatedAt: member.subscription?.updated_at ?? member.profile.updated_at,
  };
}

export default async function AdminReconciliacaoPage() {
  const members = (await getMembers()).slice(0, 300);
  const summaries = await getMemberOperationalSummaries(members, { limit: 300 });
  const issues: ReconciliationIssue[] = [];

  for (const member of members) {
    const journey = summaries.get(member.profile.id) ?? null;
    const health = calculateMemberHealth(member, journey);
    const diagnosis = getMemberDiagnosis(member, journey);
    const actions = getRecommendedActions(member, journey);
    const flags = getOperationalFlags(member, journey);
    const subscription: any = member.subscription;
    const status = normalize(subscription?.status);
    const stripeCustomer = getStripeCustomer(subscription);
    const stripeSubscription = getStripeSubscription(subscription);
    const migrated = isMigrated(member);
    const ageMinutes = minutesSince(subscription?.created_at ?? member.profile.created_at);
    const base = buildIssueBase(member, health.score);

    if (subscription && isPresent(stripeCustomer) && !isPresent(stripeSubscription) && !migrated) {
      issues.push({
        id: `customer-without-sub-${member.profile.id}`,
        severity: status === "pending" ? "critical" : "warning",
        category: "Customer sem subscription",
        title: "Customer do gateway sem assinatura vinculada",
        description: "Existe customer no gateway, mas nenhuma subscription local vinculada ao assinante.",
        action: "Conferir assinatura no gateway antes de qualquer ajuste manual.",
        evidence: [`Customer: ${stripeCustomer}`, "Subscription: ausente", `Status local: ${subscription.status ?? "sem status"}`],
        ...base,
      });
    }

    if (subscription && status === "pending" && typeof ageMinutes === "number" && ageMinutes >= 1440) {
      issues.push({
        id: `pending-24h-${member.profile.id}`,
        severity: "critical",
        category: "Pending > 24h",
        title: "Assinatura pending há mais de 24h",
        description: "A assinatura passou da janela normal de confirmação e deve ser reconciliada.",
        action: actions[0]?.description ?? "Conferir pagamento e último webhook.",
        evidence: [`Idade estimada: ${ageMinutes} min`, `Último evento: ${subscription.last_webhook_event ?? "não registrado"}`],
        ...base,
      });
    } else if (subscription && status === "pending" && typeof ageMinutes === "number" && ageMinutes >= 30) {
      issues.push({
        id: `pending-30m-${member.profile.id}`,
        severity: "warning",
        category: "Pending > 30min",
        title: "Assinatura pending há mais de 30min",
        description: "A assinatura está pending acima da janela inicial de checkout/webhook.",
        action: "Acompanhar chegada do webhook e confirmar status do pagamento.",
        evidence: [`Idade estimada: ${ageMinutes} min`, `Diagnóstico: ${diagnosis.title}`],
        ...base,
      });
    }

    if (!subscription) {
      issues.push({
        id: `profile-no-sub-${member.profile.id}`,
        severity: "info",
        category: "Perfil sem assinatura",
        title: "Perfil sem assinatura local",
        description: "Existe profile/Auth, mas nenhuma assinatura foi encontrada para este usuário.",
        action: "Confirmar se é lead/free legítimo ou falha de criação de assinatura.",
        evidence: [`E-mail: ${member.profile.email ?? "sem e-mail"}`, `Criado em: ${formatDateTimeBR(member.profile.created_at)}`],
        ...base,
      });
    }

    if (health.score < 40 || flags.includes("critical")) {
      issues.push({
        id: `low-health-${member.profile.id}`,
        severity: "warning",
        category: "Score crítico",
        title: "Score operacional crítico",
        description: diagnosis.cause,
        action: diagnosis.action,
        evidence: [`Score: ${health.score}/100`, ...health.reasons.slice(0, 3)],
        ...base,
      });
    }
  }

  const deduped = Array.from(new Map(issues.map((issue) => [issue.id, issue])).values()).sort((a, b) => {
    const bySeverity = severityOrder(a.severity) - severityOrder(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
  });

  const critical = deduped.filter((issue) => issue.severity === "critical").length;
  const warning = deduped.filter((issue) => issue.severity === "warning").length;
  const info = deduped.filter((issue) => issue.severity === "info").length;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader title="Reconciliação de Assinaturas" description="Centro somente leitura para encontrar pendências entre cadastro, assinatura, gateway e jornada do usuário." />
        <Link href="/admin/incidentes" className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10">
          Ver incidentes <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <article className="rounded-3xl border border-white/10 bg-gradient-to-br from-surface via-surface to-background p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.22em] text-muted">Amostra analisada</p>
          <p className="mt-2 text-3xl font-semibold text-white">{members.length}</p>
          <p className="mt-1 text-xs text-muted">Membros mais recentes</p>
        </article>
        <article className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.22em] text-red-200/80">Críticos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{critical}</p>
        </article>
        <article className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-200/80">Atenção</p>
          <p className="mt-2 text-3xl font-semibold text-white">{warning}</p>
        </article>
        <article className="rounded-3xl border border-sky-400/30 bg-sky-500/10 p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.22em] text-sky-200/80">Informativos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{info}</p>
        </article>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl border border-gold-400/30 bg-gold-500/10 p-2 text-gold-200"><SearchCheck className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-semibold text-white">Regras verificadas</h2>
            <p className="mt-1 text-sm text-muted">Customer sem subscription, pending acima de 30min/24h, profile sem assinatura e score operacional crítico. Nenhuma ação automática é executada aqui.</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
        <div className="border-b border-border/70 bg-gradient-to-br from-surface-muted to-background p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-2 text-amber-200"><CreditCard className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-semibold text-white">Fila de reconciliação</h2>
              <p className="text-sm text-muted">Ordenada por criticidade e atualização recente.</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border/70">
                <th className="p-4 font-medium">Assinante</th>
                <th className="font-medium">Categoria</th>
                <th className="font-medium">Problema</th>
                <th className="font-medium">Status / Score</th>
                <th className="font-medium">Evidências</th>
                <th className="font-medium">Ação sugerida</th>
                <th className="font-medium">Jornada</th>
              </tr>
            </thead>
            <tbody>
              {deduped.map((issue) => (
                <tr key={issue.id} className="border-b border-border/60 last:border-none hover:bg-white/[0.02]">
                  <td className="p-4 align-top">
                    <p className="font-medium text-white">{issue.memberName}</p>
                    <p className="mt-1 text-xs text-muted">{issue.memberEmail}</p>
                    <p className="mt-2 text-[11px] text-zinc-500">{issue.planName}</p>
                  </td>
                  <td className="align-top">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${severityClass(issue.severity)}`}>
                      {issue.severity === "critical" ? <AlertTriangle className="h-3.5 w-3.5" /> : issue.severity === "warning" ? <Clock className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                      {issue.category}
                    </span>
                  </td>
                  <td className="align-top">
                    <p className="max-w-[260px] font-medium text-white">{issue.title}</p>
                    <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-muted">{issue.description}</p>
                  </td>
                  <td className="align-top text-muted">
                    <p>Status: {issue.status}</p>
                    <p className="mt-1">Score: {issue.score}/100</p>
                    <p className="mt-1 text-xs text-zinc-500">Atualizado: {formatDateTimeBR(issue.updatedAt ?? issue.createdAt)}</p>
                  </td>
                  <td className="align-top">
                    <div className="max-w-[260px] space-y-1">
                      {issue.evidence.slice(0, 4).map((item) => <p key={item} className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-300">{item}</p>)}
                    </div>
                  </td>
                  <td className="align-top">
                    <p className="max-w-[280px] text-xs leading-relaxed text-muted">{issue.action}</p>
                  </td>
                  <td className="align-top">
                    <Link href={issue.href} className="inline-flex items-center gap-2 rounded-xl border border-gold-400/30 bg-gold-500/10 px-3 py-2 text-xs font-medium text-gold-200 transition hover:bg-gold-500/20">
                      Abrir jornada <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
              {!deduped.length ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted">Nenhuma pendência de reconciliação encontrada na amostra atual.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
