import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { PageHeader } from "@/components/admin/page-header";
import {
  cancelMemberSubscription,
  deleteMember,
  getMemberById,
  getSubscriberJourneyData,
  reactivateMemberSubscription,
  updateMemberSubscription,
} from "@/lib/data/members";
import { getPlans } from "@/lib/data/plans";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { setFlashToast } from "@/lib/flash";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_OPTIONS = ["active", "trialing", "pending", "canceled", "inactive"] as const;
type JourneyStatus = "concluído" | "pendente" | "ausente" | "erro" | "informação";
type Severity = "success" | "info" | "warning" | "critical";

type JourneyTimelineEvent = {
  at?: string | null;
  type: string;
  description: string;
  source: string;
  status: JourneyStatus | string;
  details?: unknown;
};

type JourneyDiagnosis = {
  severity: Severity;
  title: string;
  cause: string;
  action: string;
  confidence: "baixa" | "média" | "alta";
  evidence: string[];
};

function statusBadgeClass(status?: string | null) {
  switch (status) {
    case "active":
    case "trialing":
    case "concluído":
    case "enviado":
    case "entregue":
    case "allowed":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
    case "pending":
    case "pendente":
    case "informação":
      return "border-amber-400/40 bg-amber-500/10 text-amber-200";
    case "canceled":
    case "inactive":
    case "erro":
    case "falhou":
    case "denied":
      return "border-red-400/40 bg-red-500/10 text-red-200";
    case "ausente":
      return "border-zinc-500/40 bg-zinc-500/10 text-zinc-300";
    default:
      return "border-border bg-surface-muted text-muted";
  }
}

function severityClass(severity: Severity) {
  switch (severity) {
    case "critical":
      return "border-red-400/40 bg-red-500/10 text-red-100";
    case "warning":
      return "border-amber-400/40 bg-amber-500/10 text-amber-100";
    case "success":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
    default:
      return "border-sky-400/40 bg-sky-500/10 text-sky-100";
  }
}

function getMetadataValue(profile: any, key: string) {
  return profile?.user_metadata?.[key] ?? profile?.raw_user_meta_data?.[key] ?? null;
}

function isPresent(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function formatBoolean(value: unknown) {
  if (value === true) return "Sim";
  if (value === false) return "Não";
  return "-";
}

function getRowDate(row: any, preferred: string[] = []) {
  for (const key of [...preferred, "created_at", "updated_at", "processed_at", "accessed_at", "sent_at"]) {
    if (row?.[key]) return row[key] as string;
  }
  return null;
}

function getEarliestDate(rows: any[], preferred: string[] = []) {
  return rows
    .map((row) => getRowDate(row, preferred))
    .filter(Boolean)
    .sort((a, b) => new Date(String(a)).getTime() - new Date(String(b)).getTime())[0] ?? null;
}

function getCurrentProblem(profile: any, subscription: any, journey: Awaited<ReturnType<typeof getSubscriberJourneyData>>) {
  return buildDiagnosis(profile, subscription, journey).title;
}

function buildDiagnosis(profile: any, subscription: any, journey: Awaited<ReturnType<typeof getSubscriberJourneyData>>): JourneyDiagnosis {
  const stripeCustomer = subscription?.stripe_customer_id ?? subscription?.gateway_customer_id;
  const stripeSubscription = subscription?.stripe_subscription_id ?? subscription?.gateway_subscription_id;
  const migrated = Boolean(profile?.migrated_from_pms || subscription?.migrated_from_pms || subscription?.original_gateway === "pms");
  const hasFailedCommunication = (journey.communicationLogs ?? []).some((log: any) => log.status === "falhou" || log.error || log.error_message || log.details?.error);
  const activeStatuses = new Set(["active", "trialing"]);

  if (isPresent(stripeCustomer) && !isPresent(stripeSubscription)) {
    return {
      severity: subscription?.status === "pending" ? "critical" : "warning",
      title: "Customer Stripe sem subscription vinculada",
      cause: migrated
        ? "Cliente migrado do PMS com customer Stripe localizado, mas sem assinatura Stripe vinculada no banco."
        : "Customer Stripe existe, mas a subscription ainda não foi registrada ou sincronizada no Harmomus.",
      action: "Conferir a assinatura no Stripe e, se existir, sincronizar ou preencher a subscription antes de ativar o plano.",
      confidence: "alta",
      evidence: [
        `Status atual: ${subscription?.status ?? "sem assinatura"}`,
        `Stripe customer: ${stripeCustomer}`,
        "Stripe subscription: ausente",
        migrated ? "Origem: migração PMS" : "Origem: cadastro/checkout Harmomus",
      ],
    };
  }

  if (subscription?.status === "pending") {
    return {
      severity: "warning",
      title: "Assinatura pendente de ativação",
      cause: "Existe assinatura registrada, mas ela ainda não está ativa/trialing.",
      action: "Verificar último webhook, status do checkout e se o pagamento foi aprovado no gateway.",
      confidence: "alta",
      evidence: [
        `Status atual: ${subscription.status}`,
        `Último evento: ${subscription?.last_webhook_event ?? "não registrado"}`,
      ],
    };
  }

  if (profile?.onboarding_status === "pending_email_confirmation") {
    return {
      severity: "warning",
      title: "Aguardando confirmação de e-mail",
      cause: "O cadastro ainda está marcado como pendente de confirmação de e-mail.",
      action: "Reenviar acesso/confirmar entrega do e-mail ou orientar o usuário a verificar caixa de entrada e spam.",
      confidence: "alta",
      evidence: [`Onboarding: ${profile.onboarding_status}`, `Etapa: ${profile?.onboarding_step ?? "sem etapa"}`],
    };
  }

  if (!profile?.last_login_at) {
    return {
      severity: "info",
      title: "Usuário ainda não realizou login",
      cause: "O cadastro existe, mas não há registro de primeiro login.",
      action: "Reenviar link de acesso ou orientar o usuário a entrar com o e-mail cadastrado.",
      confidence: "alta",
      evidence: [
        profile?.password_setup_completed_at ? `Senha configurada em ${formatDateTimeBR(profile.password_setup_completed_at)}` : "Senha sem configuração registrada",
        "last_login_at ausente",
      ],
    };
  }

  if (hasFailedCommunication) {
    return {
      severity: "warning",
      title: "Falha recente em comunicação",
      cause: "Há registros de comunicação com erro/falha para este usuário.",
      action: "Abrir o bloco Comunicações e revisar o provider_message_id/erro retornado.",
      confidence: "média",
      evidence: ["communication_logs contém falha ou erro"],
    };
  }

  if (activeStatuses.has(subscription?.status)) {
    return {
      severity: "success",
      title: "Jornada saudável",
      cause: "Assinatura ativa/trialing e sem problema crítico detectado na leitura administrativa.",
      action: "Nenhuma ação obrigatória. Use a timeline apenas para auditoria fina.",
      confidence: "média",
      evidence: [`Status atual: ${subscription?.status}`],
    };
  }

  return {
    severity: "info",
    title: "Sem diagnóstico crítico",
    cause: "Não há dados suficientes para apontar uma falha específica.",
    action: "Conferir timeline, Stripe, comunicações e atividade manualmente.",
    confidence: "baixa",
    evidence: ["Nenhuma regra automática foi acionada"],
  };
}

function buildChecklist(profile: any, subscription: any, journey: Awaited<ReturnType<typeof getSubscriberJourneyData>>) {
  const stripeCustomer = subscription?.stripe_customer_id ?? subscription?.gateway_customer_id;
  const stripeSubscription = subscription?.stripe_subscription_id ?? subscription?.gateway_subscription_id;
  const activeStatuses = new Set(["active", "trialing"]);

  return [
    { label: "Perfil criado", status: profile?.created_at ? "concluído" : "ausente", detail: formatDateTimeBR(profile?.created_at) },
    { label: "Senha configurada", status: profile?.password_setup_completed_at ? "concluído" : profile?.requires_password_setup ? "pendente" : "informação", detail: profile?.password_setup_completed_at ? formatDateTimeBR(profile.password_setup_completed_at) : "Sem data registrada" },
    { label: "E-mail confirmado", status: profile?.onboarding_status === "pending_email_confirmation" ? "pendente" : "informação", detail: profile?.onboarding_status === "pending_email_confirmation" ? "Aguardando confirmação de e-mail" : profile?.onboarding_status ?? "Sem status específico" },
    { label: "Assinatura criada", status: subscription?.created_at ? "concluído" : "ausente", detail: formatDateTimeBR(subscription?.created_at) },
    { label: "Stripe Customer vinculado", status: stripeCustomer ? "concluído" : "ausente", detail: stripeCustomer ?? "Sem customer" },
    { label: "Stripe Subscription vinculada", status: stripeSubscription ? "concluído" : stripeCustomer ? "erro" : "ausente", detail: stripeSubscription ?? "Sem subscription" },
    { label: "Plano ativo", status: activeStatuses.has(subscription?.status) ? "concluído" : subscription?.status === "pending" ? "pendente" : "ausente", detail: subscription?.status ?? "Sem assinatura" },
    { label: "Primeiro login realizado", status: profile?.last_login_at ? "concluído" : "pendente", detail: formatDateTimeBR(profile?.last_login_at) },
    { label: "Primeiro acesso a kit", status: journey.kitAccessLogs.length ? "concluído" : "ausente", detail: journey.kitAccessLogs.length ? formatDateTimeBR(getEarliestDate(journey.kitAccessLogs, ["accessed_at"])) : "Sem acesso registrado" },
    { label: "Primeiro áudio reproduzido", status: journey.audioAccessLogs.some((log: any) => log.status !== "denied") ? "concluído" : journey.audioAccessLogs.length ? "erro" : "ausente", detail: journey.audioAccessLogs.length ? formatDateTimeBR(getEarliestDate(journey.audioAccessLogs, ["accessed_at"])) : "Sem áudio registrado" },
    { label: "Comunicação enviada", status: journey.communicationLogs.some((log: any) => ["enviado", "entregue", "abriu", "clicou", "respondeu"].includes(log.status)) ? "concluído" : journey.communicationLogs.some((log: any) => log.status === "falhou") ? "erro" : "ausente", detail: journey.communicationLogs[0]?.status ?? "Sem comunicação" },
  ] as Array<{ label: string; status: JourneyStatus; detail: string }>;
}

function addTimelineEvent(events: JourneyTimelineEvent[], event: JourneyTimelineEvent) {
  if (!event.at) return;
  events.push(event);
}

function buildTimeline(profile: any, subscription: any, journey: Awaited<ReturnType<typeof getSubscriberJourneyData>>) {
  const events: JourneyTimelineEvent[] = [];
  addTimelineEvent(events, { at: profile?.created_at, type: "Perfil", description: "Perfil criado", source: "profiles.created_at", status: "concluído", details: profile });
  addTimelineEvent(events, { at: profile?.password_setup_completed_at, type: "Onboarding", description: "Senha configurada", source: "profiles.password_setup_completed_at", status: "concluído", details: { password_setup_completed_at: profile?.password_setup_completed_at } });
  addTimelineEvent(events, { at: subscription?.created_at, type: "Assinatura", description: `Assinatura criada (${subscription?.status ?? "sem status"})`, source: "subscriptions.created_at", status: subscription?.status ?? "informação", details: subscription });
  addTimelineEvent(events, { at: subscription?.updated_at, type: "Assinatura", description: "Assinatura atualizada", source: "subscriptions.updated_at", status: subscription?.status ?? "informação", details: subscription });

  for (const log of journey.webhookLogs) addTimelineEvent(events, { at: log.created_at, type: "Webhook", description: log.event ?? log.delivery_id ?? "Webhook recebido", source: "webhook_logs", status: log.success === false ? "erro" : "concluído", details: log });
  for (const event of journey.webhookProcessedEvents) addTimelineEvent(events, { at: event.processed_at ?? event.created_at, type: "Webhook processado", description: event.event_type ?? event.event_id ?? "Evento processado", source: "webhook_processed_events", status: "concluído", details: event });
  for (const log of journey.communicationLogs) addTimelineEvent(events, { at: log.created_at, type: "Comunicação", description: `${log.channel ?? "canal"} ${log.status ?? "registrado"}`, source: "communication_logs", status: log.status ?? "informação", details: log });
  for (const log of journey.kitAccessLogs) addTimelineEvent(events, { at: log.accessed_at ?? log.created_at, type: "Acesso a kit", description: `Kit ${log.kit_id ?? "acessado"}`, source: "kit_access_logs", status: log.status ?? "concluído", details: log });
  for (const log of journey.audioAccessLogs) addTimelineEvent(events, { at: log.accessed_at ?? log.created_at, type: "Áudio", description: `Áudio ${log.audio_file_id ?? "reproduzido"}`, source: "audio_access_logs", status: log.status ?? "concluído", details: log });

  return events.sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()).slice(0, 80);
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <p className="break-words text-sm text-muted">
      <strong className="text-white">{label}:</strong> {String(value ?? "-")}
    </p>
  );
}

function JsonDetails({ value }: { value: unknown }) {
  return (
    <details className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-gold-300">Ver detalhes técnicos</summary>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-300">{JSON.stringify(value ?? {}, null, 2)}</pre>
    </details>
  );
}

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [memberResult, plansResult] = await Promise.allSettled([getMemberById(id), getPlans()]);
  const member = memberResult.status === "fulfilled" ? memberResult.value : null;
  const plans = plansResult.status === "fulfilled" ? plansResult.value : [];

  const journey = member ? await getSubscriberJourneyData(member) : null;
  const profile: any = member?.profile ?? null;
  const subscription: any = member?.subscription ?? null;
  const currentPlanId = subscription?.plan_id ?? "";
  const currentStatus = subscription?.status ?? "inactive";
  const username = getMetadataValue(profile, "username") ?? "-";
  const phone = profile?.phone ?? getMetadataValue(profile, "phone") ?? "-";
  const checklist = journey && profile ? buildChecklist(profile, subscription, journey) : [];
  const timeline = journey && profile ? buildTimeline(profile, subscription, journey) : [];
  const latestWebhook = journey?.webhookProcessedEvents[0] ?? journey?.webhookLogs[0] ?? null;
  const diagnosis = journey && profile ? buildDiagnosis(profile, subscription, journey) : null;
  const currentProblem = diagnosis?.title ?? "Dados insuficientes";

  async function save(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") ?? "");
    const planId = String(formData.get("plan_id") ?? "");
    const status = String(formData.get("status") ?? "inactive") as any;

    try {
      await updateMemberSubscription(userId, { plan_id: planId || undefined, status });
      await setFlashToast("success", "Plano/status do membro atualizado com sucesso.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível atualizar este membro.");
    }

    revalidatePath(`/admin/membros/${userId}`);
    revalidatePath("/admin/membros");
  }

  async function cancel(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") ?? "");

    try {
      await cancelMemberSubscription(userId);
      await setFlashToast("success", "Assinatura cancelada com sucesso.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível cancelar a assinatura.");
    }

    revalidatePath(`/admin/membros/${userId}`);
    revalidatePath("/admin/membros");
  }

  async function reactivate(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") ?? "");

    try {
      await reactivateMemberSubscription(userId);
      await setFlashToast("success", "Assinatura reativada com sucesso.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível reativar a assinatura.");
    }

    revalidatePath(`/admin/membros/${userId}`);
    revalidatePath("/admin/membros");
  }

  async function remove(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") ?? "");

    try {
      await deleteMember(userId);
      await setFlashToast("success", "Membro excluído definitivamente com sucesso.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível excluir o membro.");
    }

    revalidatePath("/admin/membros");
    redirect("/admin/membros");
  }

  if (!member || !profile || !journey) {
    return (
      <section className="space-y-6">
        <PageHeader title="Membro não encontrado" description="Não foi possível carregar este membro." />
        <a href="/admin/membros" className="inline-flex rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-white">Voltar para membros</a>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Detalhe do Membro" description="Gerencie plano, status, assinatura e ações administrativas." />

      <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface via-surface to-background shadow-premium">
        <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-gold-300">Membro</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{profile.full_name ?? "Sem nome"}</h2>
            <p className="mt-1 text-sm text-muted">{profile.email ?? "Sem e-mail"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#jornada-assinante" className="rounded-xl border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/20">Jornada do Assinante</a>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusBadgeClass(currentStatus)}`}>{currentStatus}</span>
            <a href="/admin/membros" className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition hover:border-gold-500/40 hover:text-white">Voltar</a>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
          <h3 className="text-lg font-semibold text-white">Dados do perfil</h3>
          <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-2">
            <Field label="Nome" value={profile.full_name} />
            <Field label="E-mail" value={profile.email} />
            <Field label="Username" value={username} />
            <Field label="Telefone" value={phone} />
            <Field label="Cadastro" value={formatDateTimeBR(profile.created_at)} />
            <Field label="Atualizado" value={formatDateTimeBR(profile.updated_at)} />
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
          <h3 className="text-lg font-semibold text-white">Assinatura</h3>
          <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-2">
            <Field label="Plano atual" value={member.plan?.name ?? "Free"} />
            <Field label="Status" value={currentStatus} />
            <Field label="Gateway" value={subscription?.gateway} />
            <Field label="Stripe Customer" value={subscription?.stripe_customer_id} />
            <Field label="Stripe Sub" value={subscription?.stripe_subscription_id} />
            <Field label="Próx. cobrança" value={formatDateTimeBR(subscription?.next_billing_at ?? subscription?.current_period_end)} />
          </div>
        </div>
      </div>

      <section id="jornada-assinante" className="space-y-5 rounded-[2rem] border border-gold-500/30 bg-gradient-to-br from-gold-500/10 via-surface to-background p-5 shadow-premium sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-gold-300">Visão premium</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Jornada do Assinante</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Diagnóstico somente leitura do caminho do usuário desde cadastro, migração, ativação de assinatura, comunicações e primeiros acessos.</p>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(currentStatus)}`}>{currentProblem}</span>
        </div>

        {diagnosis ? (
          <div className={`rounded-3xl border p-5 ${severityClass(diagnosis.severity)}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] opacity-80">Centro de Diagnóstico</p>
                <h4 className="mt-2 text-xl font-semibold text-white">{diagnosis.title}</h4>
                <p className="mt-2 text-sm leading-6 opacity-90"><strong>Causa provável:</strong> {diagnosis.cause}</p>
                <p className="mt-1 text-sm leading-6 opacity-90"><strong>Ação sugerida:</strong> {diagnosis.action}</p>
              </div>
              <div className="grid min-w-[220px] gap-2 text-sm">
                <span className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">Severidade: <strong>{diagnosis.severity}</strong></span>
                <span className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">Confiança: <strong>{diagnosis.confidence}</strong></span>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {diagnosis.evidence.map((item) => (
                <p key={item} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs opacity-90">{item}</p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Status atual</p>
            <p className="mt-2 text-lg font-semibold text-white">{currentStatus}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Plano / Gateway</p>
            <p className="mt-2 text-lg font-semibold text-white">{member.plan?.name ?? "Free"}</p>
            <p className="text-xs text-muted">{subscription?.gateway ?? subscription?.original_gateway ?? "Sem gateway"}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Origem</p>
            <p className="mt-2 text-lg font-semibold text-white">{profile.migrated_from_pms || subscription?.migrated_from_pms ? "Usuário migrado do PMS" : "Novo cadastro"}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Último webhook/evento</p>
            <p className="mt-2 text-sm font-semibold text-white">{latestWebhook?.event_type ?? latestWebhook?.event ?? subscription?.last_webhook_event ?? "Sem evento conhecido"}</p>
            <p className="text-xs text-muted">{formatDateTimeBR(latestWebhook?.processed_at ?? latestWebhook?.created_at)}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <h4 className="text-lg font-semibold text-white">Checklist visual</h4>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {checklist.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-white">{item.label}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(item.status)}`}>{item.status}</span>
                </div>
                <p className="mt-2 text-xs text-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <h4 className="text-lg font-semibold text-white">Stripe</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="gateway_customer_id" value={subscription?.gateway_customer_id} />
              <Field label="gateway_subscription_id" value={subscription?.gateway_subscription_id} />
              <Field label="stripe_customer_id" value={subscription?.stripe_customer_id} />
              <Field label="stripe_subscription_id" value={subscription?.stripe_subscription_id} />
              <Field label="stripe_price_id" value={subscription?.stripe_price_id} />
              <Field label="status" value={subscription?.status} />
              <Field label="next_billing_at" value={formatDateTimeBR(subscription?.next_billing_at)} />
              <Field label="current_period_end" value={formatDateTimeBR(subscription?.current_period_end)} />
              <Field label="cancel_at_period_end" value={formatBoolean(subscription?.cancel_at_period_end ?? (subscription?.auto_renew === false ? true : null))} />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <h4 className="text-lg font-semibold text-white">Legado/PMS</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="migrated_from_pms" value={formatBoolean(profile.migrated_from_pms || subscription?.migrated_from_pms)} />
              <Field label="original_gateway" value={subscription?.original_gateway} />
              <Field label="legacy_pms_member_id" value={profile.legacy_pms_member_id} />
              <Field label="legacy_pms_subscription_id" value={subscription?.legacy_pms_subscription_id} />
            </div>
            <div className="mt-4 space-y-3">
              {journey.legacyPmsSubscriptions.length ? journey.legacyPmsSubscriptions.map((row, index) => <JsonDetails key={`legacy-pms-${index}`} value={row} />) : <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted">Nenhum dado localizado em legacy_pms_subscriptions pelos fallbacks seguros.</p>}
              {(journey.legacyStripeCustomers.length || journey.legacyStripeCustomerImports.length) ? <JsonDetails value={{ legacy_stripe_customers: journey.legacyStripeCustomers, legacy_stripe_customer_import: journey.legacyStripeCustomerImports }} /> : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <h4 className="text-lg font-semibold text-white">Comunicações</h4>
            <div className="mt-4 space-y-3">
              {journey.communicationLogs.length ? journey.communicationLogs.slice(0, 10).map((log: any) => (
                <div key={log.id ?? JSON.stringify(log)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-white">{log.channel === "whatsapp" ? "WhatsApp enviado" : "E-mail enviado"}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${statusBadgeClass(log.status)}`}>{log.status ?? "informação"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{formatDateTimeBR(log.created_at)} · {log.provider_message_id ?? "sem provider_message_id"}</p>
                  {(log.error || log.error_message || log.details?.error) ? <p className="mt-2 text-xs text-red-200">Erro: {log.error ?? log.error_message ?? log.details?.error}</p> : null}
                  <JsonDetails value={log} />
                </div>
              )) : <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted">Nenhuma comunicação encontrada para este usuário.</p>}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <h4 className="text-lg font-semibold text-white">Atividade</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Último login" value={formatDateTimeBR(profile.last_login_at)} />
              <Field label="Último seen" value={formatDateTimeBR(profile.last_seen_at)} />
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-white">Últimos kits acessados</p>
                <div className="mt-2 space-y-2">
                  {journey.kitAccessLogs.slice(0, 5).map((log: any) => <p key={log.id ?? JSON.stringify(log)} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-muted">{log.kit_id ?? "Kit"} · {formatDateTimeBR(log.accessed_at ?? log.created_at)}</p>)}
                  {!journey.kitAccessLogs.length ? <p className="text-xs text-muted">Sem kits acessados.</p> : null}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Últimos áudios acessados</p>
                <div className="mt-2 space-y-2">
                  {journey.audioAccessLogs.slice(0, 5).map((log: any) => <p key={log.id ?? JSON.stringify(log)} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-muted">{log.audio_file_id ?? "Áudio"} · {log.status ?? "-"} · {formatDateTimeBR(log.accessed_at ?? log.created_at)}</p>)}
                  {!journey.audioAccessLogs.length ? <p className="text-xs text-muted">Sem áudios acessados.</p> : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <h4 className="text-lg font-semibold text-white">Timeline cronológica consolidada</h4>
          <div className="mt-5 space-y-3">
            {timeline.length ? timeline.map((event, index) => (
              <article key={`${event.source}-${event.at}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">{formatDateTimeBR(event.at)} · {event.source}</p>
                    <h5 className="mt-1 font-semibold text-white">{event.type}</h5>
                    <p className="mt-1 text-sm text-muted">{event.description}</p>
                  </div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-xs ${statusBadgeClass(event.status)}`}>{event.status}</span>
                </div>
                <JsonDetails value={event.details} />
              </article>
            )) : <p className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm text-muted">Nenhum evento encontrado na jornada pelos fallbacks seguros.</p>}
          </div>
        </div>
      </section>

      <form action={save} className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
        <input type="hidden" name="user_id" value={profile.id ?? id} />
        <h3 className="text-lg font-semibold text-white">Alterar plano/status</h3>
        <p className="mt-1 text-sm text-muted">Use esta área para ajustes administrativos manuais, suporte e correções de acesso.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-muted">Plano
            <select name="plan_id" defaultValue={currentPlanId} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50">
              <option value="">Free</option>
              {plans.map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">Status
            <select name="status" defaultValue={currentStatus} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50">
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button className="rounded-xl bg-gold-500/20 px-5 py-3 text-sm font-semibold text-gold-300 transition hover:bg-gold-500/30">Salvar alteração</button>
          <ConfirmSubmitButton formAction={cancel} message="Tem certeza que deseja cancelar a assinatura deste membro?" title="Cancelar assinatura?" confirmLabel="Sim, cancelar" className="rounded-xl border border-red-500/50 px-5 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/10">Cancelar assinatura</ConfirmSubmitButton>
          <ConfirmSubmitButton formAction={reactivate} message="Tem certeza que deseja reativar a assinatura deste membro?" title="Reativar assinatura?" confirmLabel="Sim, reativar" className="rounded-xl border border-emerald-500/50 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10">Reativar assinatura</ConfirmSubmitButton>
        </div>
      </form>

      <form action={remove} className="rounded-3xl border border-red-500/40 bg-red-500/5 p-5 shadow-premium sm:p-6">
        <input type="hidden" name="user_id" value={profile.id ?? id} />
        <h3 className="text-lg font-semibold text-red-200">Zona de risco</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-red-100/80">Excluir este membro remove o usuário do Auth, perfil, assinatura, playlists e registros vinculados. Use apenas para cadastros de teste, duplicados ou casos de suporte já conferidos.</p>
        <ConfirmSubmitButton title="Excluir membro definitivamente?" confirmLabel="Sim, excluir membro" message="Atenção: esta ação é definitiva e removerá usuário, assinatura, playlists e dados vinculados. Deseja continuar?" className="mt-5 rounded-xl border border-red-400/70 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10">Excluir definitivamente</ConfirmSubmitButton>
      </form>
    </section>
  );
}
