import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CreditCard,
  MailPlus,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { getMemberOperationalSummaries, getMembers } from "@/lib/data/members";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { getPlans } from "@/lib/data/plans";
import { calculateMemberHealth, getMemberDiagnosis, getOperationalFlags } from "@/lib/member-health";

type SearchParams = Promise<{ q?: string; plan?: string; status?: string; operational?: string }>;
type Member = Awaited<ReturnType<typeof getMembers>>[number];

type JourneyStage = "lead" | "checkout" | "pending" | "active" | "at_risk" | "lost";

type JourneyView = {
  stage: JourneyStage;
  label: string;
  description: string;
  health: "success" | "warning" | "danger" | "neutral";
  nextAction: string;
  actionHref: string;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function formatMoney(cents?: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents ?? 0) / 100);
}

function safeDate(value?: string | null) {
  return value ? formatDateTimeBR(value) : "—";
}

function isPaidPlan(member: Member) {
  return normalize(member.plan?.slug) !== "free" && Number(member.plan?.price_cents ?? 0) > 0;
}

function getJourney(member: Member): JourneyView {
  const status = normalize(member.subscription?.status);
  const gateway = normalize(member.subscription?.gateway);
  const originalGateway = normalize((member.subscription as any)?.original_gateway);
  const stripeCustomer = member.subscription?.stripe_customer_id ?? (member.subscription as any)?.gateway_customer_id;
  const stripeSub = member.subscription?.stripe_subscription_id ?? (member.subscription as any)?.gateway_subscription_id;
  const migrated =
    gateway === "legacy" ||
    gateway === "migration" ||
    gateway === "pms" ||
    originalGateway === "pms" ||
    Boolean((member.profile as any)?.migrated_from_pms) ||
    Boolean((member.profile as any)?.legacy_pms_member_id) ||
    Boolean((member.subscription as any)?.migrated_from_pms) ||
    Boolean((member.subscription as any)?.legacy_pms_subscription_id);

  if (!member.subscription) {
    return {
      stage: "lead",
      label: "Lead sem assinatura",
      description: "Perfil existe, mas ainda não há assinatura registrada.",
      health: "neutral",
      nextAction: "Nutrir lead",
      actionHref: `/admin/comunicacao/campaigns?segment=lead&email=${encodeURIComponent(member.profile.email ?? "")}`,
    };
  }

  if (status === "active" || status === "trialing") {
    if (isPaidPlan(member)) {
      return {
        stage: "active",
        label: "Cliente ativo",
        description: stripeSub ? "Pagamento e assinatura vinculados." : migrated ? "Cliente ativo por migração/legado." : "Ativo, mas sem subscription Stripe visível.",
        health: stripeSub || migrated ? "success" : "warning",
        nextAction: stripeSub || migrated ? "Acompanhar uso" : "Conferir Stripe",
        actionHref: `/admin/membros/${member.profile.id}`,
      };
    }

    return {
      stage: "lead",
      label: "Free ativo",
      description: "Usuário ativo em plano gratuito. Bom alvo para upgrade.",
      health: "neutral",
      nextAction: "Campanha de upgrade",
      actionHref: `/admin/comunicacao/campaigns?segment=free&email=${encodeURIComponent(member.profile.email ?? "")}`,
    };
  }

  if (status === "pending" && migrated) {
    return {
      stage: "at_risk",
      label: "Legado/PMS reconhecido",
      description: "Assinatura pending de migração/PMS: conferir ativação sem tratar como checkout abandonado.",
      health: "warning",
      nextAction: "Conferir ativação",
      actionHref: `/admin/membros/${member.profile.id}`,
    };
  }

  if (status === "pending") {
    return {
      stage: "pending",
      label: "Parado no pagamento",
      description: stripeCustomer ? "Customer criado, mas assinatura ainda pendente." : "Assinatura pendente sem customer claro.",
      health: "warning",
      nextAction: "Recuperar checkout",
      actionHref: `/admin/comunicacao/campaigns?segment=pending&email=${encodeURIComponent(member.profile.email ?? "")}`,
    };
  }

  if (status === "canceled" || status === "expired" || status === "inactive") {
    return {
      stage: "lost",
      label: "Churn / perdido",
      description: "Assinatura cancelada, expirada ou inativa.",
      health: "danger",
      nextAction: "Reativação",
      actionHref: `/admin/comunicacao/campaigns?segment=churn&email=${encodeURIComponent(member.profile.email ?? "")}`,
    };
  }

  return {
    stage: "at_risk",
    label: "Revisar manualmente",
    description: `Status ${member.subscription?.status ?? "desconhecido"}. Precisa de conferência.` ,
    health: "warning",
    nextAction: "Abrir diagnóstico",
    actionHref: `/admin/membros/${member.profile.id}`,
  };
}

function healthClass(health: JourneyView["health"]) {
  if (health === "success") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (health === "warning") return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  if (health === "danger") return "border-red-400/30 bg-red-500/10 text-red-200";
  return "border-white/10 bg-white/5 text-zinc-300";
}

function stagePillClass(stage: JourneyStage) {
  if (stage === "active") return "bg-emerald-500/15 text-emerald-200 border-emerald-400/30";
  if (stage === "pending" || stage === "checkout") return "bg-amber-500/15 text-amber-200 border-amber-400/30";
  if (stage === "lost" || stage === "at_risk") return "bg-red-500/15 text-red-200 border-red-400/30";
  return "bg-cyan-500/10 text-cyan-200 border-cyan-400/30";
}

function healthSeverityClass(severity: "success" | "info" | "warning" | "critical") {
  if (severity === "success") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (severity === "info") return "border-sky-400/40 bg-sky-500/10 text-sky-200";
  if (severity === "warning") return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  return "border-red-400/40 bg-red-500/10 text-red-200";
}

function flagLabel(flag: string) {
  const labels: Record<string, string> = {
    pending: "Pending",
    no_login: "Sem login profile",
    no_real_access: "Sem acesso real",
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

const operationalFilters = [
  { value: "", label: "Todos" },
  { value: "healthy", label: "Saudáveis" },
  { value: "critical", label: "Críticos" },
  { value: "pending", label: "Pending" },
  { value: "no_login", label: "Sem login no profile" },
  { value: "no_real_access", label: "Sem acesso real" },
  { value: "no_stripe_subscription", label: "Sem subscription Stripe" },
  { value: "failed_communication", label: "Falha comunicação" },
  { value: "no_content_access", label: "Sem kit/áudio" },
];

function StatCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: any }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-gradient-to-br from-surface via-surface to-background p-5 shadow-premium">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">{label}</p>
        <span className="rounded-2xl border border-gold-400/20 bg-gold-500/10 p-2 text-gold-200"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </article>
  );
}

export default async function AdminMembrosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [members, plans] = await Promise.all([
    getMembers({ query: params.q, planId: params.plan, status: params.status }),
    getPlans(),
  ]);
  const operationalSummaries = await getMemberOperationalSummaries(members, { limit: 200 });

  const journeys = members
    .map((member) => {
      const operationalJourney = operationalSummaries.get(member.profile.id) ?? null;
      const health = calculateMemberHealth(member, operationalJourney);
      const flags = getOperationalFlags(member, operationalJourney);
      const diagnosis = getMemberDiagnosis(member, operationalJourney);
      return { member, journey: getJourney(member), operationalJourney, health, flags, diagnosis };
    })
    .filter((item) => {
      const filter = params.operational ?? "";
      if (!filter) return true;
      if (filter === "no_access" || filter === "no_content_access") return item.flags.includes("no_kit_access") || item.flags.includes("no_audio_access");
      return item.flags.includes(filter as any);
    });
  const total = members.length;
  const paidActive = members.filter((member) => ["active", "trialing"].includes(normalize(member.subscription?.status)) && isPaidPlan(member));
  const freeActive = members.filter((member) => ["active", "trialing"].includes(normalize(member.subscription?.status)) && normalize(member.plan?.slug) === "free");
  const pending = journeys.filter((item) => item.journey.stage === "pending");
  const risk = journeys.filter((item) => ["at_risk", "lost"].includes(item.journey.stage));
  const estimatedMrr = paidActive.reduce((sum, member) => sum + Number(member.plan?.price_cents ?? 0), 0);
  const conversion = total ? Math.round((paidActive.length / total) * 100) : 0;

  const pipeline = [
    { key: "lead", label: "Free / Lead", count: freeActive.length, href: "/admin/comunicacao/campaigns?segment=free" },
    { key: "pending", label: "Pagamento pendente", count: pending.length, href: "/admin/comunicacao/campaigns?segment=pending" },
    { key: "active", label: "Pagantes ativos", count: paidActive.length, href: "/admin/comunicacao/campaigns?segment=active" },
    { key: "risk", label: "Risco / churn", count: risk.length, href: "/admin/comunicacao/campaigns?segment=risk" },
  ];

  return (
    <section className="space-y-6">
      <PageHeader title="Central de Membros" description="Jornada do lead ao assinante: origem, plano, cobrança, risco e intervenção em uma visão executiva." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Base rastreada" value={String(total)} detail="Perfis sincronizados com Auth + Profiles" icon={Users} />
        <StatCard label="Pagantes ativos" value={String(paidActive.length)} detail={`MRR estimado ${formatMoney(estimatedMrr)}`} icon={CreditCard} />
        <StatCard label="Conversão da base" value={`${conversion}%`} detail={`${freeActive.length} usuários free em nutrição`} icon={TrendingUp} />
        <StatCard label="Intervenções" value={String(pending.length + risk.length)} detail="Pendentes, risco ou churn para campanha" icon={Target} />
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Pipeline de jornada</h2>
            <p className="text-sm text-muted">Clique em uma etapa para iniciar uma campanha segmentada.</p>
          </div>
          <Link href="/admin/comunicacao/campaigns" className="inline-flex items-center gap-2 rounded-2xl border border-gold-400/30 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-200 transition hover:bg-gold-500/20">
            <MailPlus className="h-4 w-4" /> Criar campanha
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {pipeline.map((step, index) => (
            <Link key={step.key} href={step.href} className="group rounded-2xl border border-white/10 bg-background/60 p-4 transition hover:border-gold-400/40 hover:bg-gold-500/10">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-white">{index + 1}</span>
                <ArrowRight className="h-4 w-4 text-muted transition group-hover:text-gold-200" />
              </div>
              <p className="text-sm font-medium text-white">{step.label}</p>
              <p className="mt-1 text-2xl font-semibold text-gold-200">{step.count}</p>
            </Link>
          ))}
        </div>
      </div>

      <form className="grid gap-3 rounded-3xl border border-border bg-surface p-4 shadow-premium md:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input name="q" placeholder="Buscar por nome/email" defaultValue={params.q} className="w-full rounded-2xl border border-border bg-background py-3 pl-10 pr-3 text-sm outline-none transition focus:border-gold-400/50" />
        </label>
        <select name="plan" defaultValue={params.plan ?? ""} className="rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none transition focus:border-gold-400/50">
          <option value="">Todos os planos</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
        <select name="status" defaultValue={params.status ?? ""} className="rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none transition focus:border-gold-400/50">
          <option value="">Todos status</option>
          {["active", "trialing", "canceled", "expired", "pending", "abandoned", "inactive"].map((status) => <option key={status}>{status}</option>)}
        </select>
        <select name="operational" defaultValue={params.operational ?? ""} className="rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none transition focus:border-gold-400/50">
          {operationalFilters.map((filter) => <option key={filter.value || "all"} value={filter.value}>{filter.label}</option>)}
        </select>
        <button className="rounded-2xl border border-gold-500/40 bg-gold-500/10 px-6 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/20">Filtrar</button>
      </form>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
        <div className="border-b border-border/70 bg-gradient-to-br from-surface-muted to-background p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Mapa dos membros</h2>
              <p className="text-sm text-muted">Cada linha mostra onde o lead/cliente está parado e qual ação tomar.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" /> Jornada enriquecida
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border/70">
                <th className="p-4 font-medium">Membro</th>
                <th className="font-medium">Plano</th>
                <th className="font-medium">Etapa da jornada</th>
                <th className="font-medium">Diagnóstico</th>
                <th className="font-medium">Saúde operacional</th>
                <th className="font-medium">Gateway</th>
                <th className="font-medium">Stripe</th>
                <th className="font-medium">Próxima cobrança</th>
                <th className="font-medium">Intervenção</th>
              </tr>
            </thead>
            <tbody>
              {journeys.map(({ member, journey, health, flags, diagnosis }) => {
                const stripeCustomer = member.subscription?.stripe_customer_id ?? (member.subscription as any)?.gateway_customer_id;
                const stripeSub = member.subscription?.stripe_subscription_id ?? (member.subscription as any)?.gateway_subscription_id;
                return (
                  <tr key={member.profile.id} className="border-b border-border/60 last:border-none hover:bg-white/[0.02]">
                    <td className="p-4 align-top">
                      <p className="font-medium text-white">{member.profile.full_name ?? "Sem nome"}</p>
                      <p className="mt-1 text-xs text-muted">{member.profile.email ?? "Sem e-mail"}</p>
                      <p className="mt-2 text-[11px] text-zinc-500">Criado: {safeDate(member.profile.created_at)}</p>
                    </td>
                    <td className="align-top">
                      <p className="font-medium text-white">{member.plan?.name ?? "Sem plano"}</p>
                      <span className="mt-2 inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-muted">{member.subscription?.status ?? "none"}</span>
                    </td>
                    <td className="align-top">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${stagePillClass(journey.stage)}`}>{journey.label}</span>
                      <p className="mt-2 max-w-[220px] text-xs leading-relaxed text-muted">{journey.description}</p>
                    </td>
                    <td className="align-top">
                      <div className={`max-w-[260px] rounded-2xl border p-3 ${healthClass(journey.health)}`}>
                        <div className="flex items-start gap-2">
                          {journey.health === "success" ? <BadgeCheck className="mt-0.5 h-4 w-4" /> : <AlertTriangle className="mt-0.5 h-4 w-4" />}
                          <div>
                            <p className="text-xs font-semibold">{journey.nextAction}</p>
                            <p className="mt-1 text-[11px] opacity-80">Abra detalhes para ver timeline, logs e evidências.</p>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="align-top">
                      <div className={`max-w-[260px] rounded-2xl border p-3 ${healthSeverityClass(health.severity)}`}>
                        <div className="flex items-start gap-2">
                          {health.severity === "success" ? <BadgeCheck className="mt-0.5 h-4 w-4" /> : <AlertTriangle className="mt-0.5 h-4 w-4" />}
                          <div>
                            <p className="text-xs font-semibold">{health.score}/100 · {health.label}</p>
                            <p className="mt-1 text-[11px] opacity-80">{diagnosis.title}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {flags.slice(0, 3).map((flag) => <span key={flag} className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-zinc-200">{flagLabel(flag)}</span>)}
                        </div>
                      </div>
                    </td>
                    <td className="align-top text-muted">{member.subscription?.gateway ?? "—"}</td>
                    <td className="align-top">
                      <p className="max-w-[180px] truncate text-xs text-muted">Customer: {stripeCustomer ?? "—"}</p>
                      <p className="mt-1 max-w-[180px] truncate text-xs text-muted">Sub: {stripeSub ?? "—"}</p>
                    </td>
                    <td className="align-top text-muted">{safeDate(member.subscription?.next_billing_at ?? member.subscription?.current_period_end)}</td>
                    <td className="align-top">
                      <div className="flex flex-col gap-2">
                        <Link href={`/admin/membros/${member.profile.id}`} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-gold-400/40 hover:text-gold-200">
                          Ver diagnóstico
                        </Link>
                        <Link href={journey.actionHref} className="inline-flex items-center justify-center rounded-xl border border-gold-400/30 bg-gold-500/10 px-3 py-2 text-xs font-medium text-gold-200 transition hover:bg-gold-500/20">
                          {journey.nextAction}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!journeys.length ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted">Nenhum membro encontrado para os filtros atuais.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
