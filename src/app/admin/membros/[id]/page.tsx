import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CreditCard,
  MailPlus,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Target,
  TrendingUp,
  UserRound,
  Zap,
} from "lucide-react";

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
type JourneyStatus = "concluído" | "pendente" | "ausente" | "erro" | "informação" | "não aplicável";
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

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function statusBadgeClass(status?: string | null) {
  switch (normalize(status)) {
    case "active":
    case "trialing":
    case "concluído":
    case "enviado":
    case "entregue":
    case "allowed":
    case "success":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
    case "pending":
    case "pendente":
    case "informação":
    case "warning":
      return "border-amber-400/40 bg-amber-500/10 text-amber-200";
    case "canceled":
    case "inactive":
    case "erro":
    case "falhou":
    case "denied":
    case "critical":
      return "border-red-400/40 bg-red-500/10 text-red-200";
    case "ausente":
      return "border-zinc-500/40 bg-zinc-500/10 text-zinc-300";
    case "não aplicável":
      return "border-sky-400/30 bg-sky-500/10 text-sky-200";
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
  return "—";
}

function safeDate(value?: string | null) {
  return value ? formatDateTimeBR(value) : "—";
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

function getLatestDate(rows: any[], preferred: string[] = []) {
  return rows
    .map((row) => getRowDate(row, preferred))
    .filter(Boolean)
    .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0] ?? null;
}

function isLegacyMember(profile: any, subscription: any) {
  const gateway = normalize(subscription?.gateway);
  const originalGateway = normalize(subscription?.original_gateway);
  return Boolean(
    profile?.migrated_from_pms ||
      subscription?.migrated_from_pms ||
      gateway === "legacy" ||
      gateway === "migration" ||
      gateway === "pms" ||
      originalGateway === "pms"
  );
}

function getActivityEvidence(profile: any, journey: Awaited<ReturnType<typeof getSubscriberJourneyData>>) {
  const communicationSetup = (journey.communicationLogs ?? []).some((log: any) =>
    JSON.stringify(log ?? {}).toLowerCase().includes("password_setup"),
  );
  const webhookSetup = [...(journey.webhookLogs ?? []), ...(journey.webhookProcessedEvents ?? [])].some((event: any) =>
    JSON.stringify(event ?? {}).toLowerCase().includes("password_setup"),
  );

  return {
    hasAny:
      Boolean(profile?.last_seen_at) ||
      Boolean(profile?.password_setup_completed_at) ||
      Boolean(profile?.password_setup_sent_at) ||
      Boolean(profile?.onboarding_completed_at) ||
      Boolean(journey.kitAccessLogs?.length) ||
      Boolean(journey.audioAccessLogs?.length) ||
      communicationSetup ||
      webhookSetup,
    evidence: [
      profile?.last_seen_at ? `last_seen_at: ${safeDate(profile.last_seen_at)}` : null,
      profile?.password_setup_completed_at ? `senha configurada: ${safeDate(profile.password_setup_completed_at)}` : null,
      profile?.password_setup_sent_at ? `link de senha enviado: ${safeDate(profile.password_setup_sent_at)}` : null,
      profile?.onboarding_completed_at ? `onboarding concluído: ${safeDate(profile.onboarding_completed_at)}` : null,
      journey.kitAccessLogs?.length ? `${journey.kitAccessLogs.length} acesso(s) a kit` : null,
      journey.audioAccessLogs?.length ? `${journey.audioAccessLogs.length} áudio(s) registrado(s)` : null,
      communicationSetup ? "comunicação de configuração de senha detectada" : null,
      webhookSetup ? "evento de configuração de senha detectado" : null,
    ].filter(Boolean) as string[],
  };
}

function buildDiagnosis(profile: any, subscription: any, journey: Awaited<ReturnType<typeof getSubscriberJourneyData>>): JourneyDiagnosis {
  const stripeCustomer = subscription?.stripe_customer_id ?? subscription?.gateway_customer_id;
  const stripeSubscription = subscription?.stripe_subscription_id ?? subscription?.gateway_subscription_id;
  const migrated = isLegacyMember(profile, subscription);
  const activityEvidence = getActivityEvidence(profile, journey);
  const hasFailedCommunication = (journey.communicationLogs ?? []).some((log: any) => log.status === "falhou" || log.error || log.error_message || log.details?.error);
  const activeStatuses = new Set(["active", "trialing"]);

  if (!migrated && isPresent(stripeCustomer) && !isPresent(stripeSubscription)) {
    return {
      severity: subscription?.status === "pending" ? "critical" : "warning",
      title: "Customer Stripe sem subscription vinculada",
      cause: "Customer Stripe existe, mas a subscription ainda não foi registrada ou sincronizada no Harmomus.",
      action: "Conferir a assinatura no Stripe e sincronizar a subscription antes de ativar ou considerar o acesso saudável.",
      confidence: "alta",
      evidence: [`Status atual: ${subscription?.status ?? "sem assinatura"}`, `Stripe customer: ${stripeCustomer}`, "Stripe subscription: ausente"],
    };
  }

  if (subscription?.status === "pending") {
    return {
      severity: "warning",
      title: "Assinatura pendente de ativação",
      cause: "Existe assinatura registrada, mas ela ainda não está ativa/trialing.",
      action: "Enviar recuperação de checkout/pagamento e revisar último webhook do gateway.",
      confidence: "alta",
      evidence: [`Status atual: ${subscription.status}`, `Último evento: ${subscription?.last_webhook_event ?? "não registrado"}`],
    };
  }

  if (profile?.onboarding_status === "pending_email_confirmation") {
    return {
      severity: "warning",
      title: "Aguardando confirmação de e-mail",
      cause: "O cadastro ainda está marcado como pendente de confirmação de e-mail.",
      action: "Reenviar acesso/confirmar entrega do e-mail e orientar o usuário a verificar caixa de entrada e spam.",
      confidence: "alta",
      evidence: [`Onboarding: ${profile.onboarding_status}`, `Etapa: ${profile?.onboarding_step ?? "sem etapa"}`],
    };
  }

  if (!profile?.last_login_at && !activityEvidence.hasAny) {
    return {
      severity: "info",
      title: "Usuário ainda não realizou login",
      cause: "O cadastro existe, mas não há registro de login nem outra evidência de uso.",
      action: "Enviar campanha de primeiro acesso com link de login e instruções simples.",
      confidence: "alta",
      evidence: ["last_login_at ausente", "nenhuma atividade detectada"],
    };
  }

  if (!profile?.last_login_at && activityEvidence.hasAny) {
    return {
      severity: activeStatuses.has(subscription?.status) ? "success" : "info",
      title: "Acesso detectado sem registro formal de login",
      cause: "O campo last_login_at está vazio, mas existem sinais de interação, migração ou configuração de senha.",
      action: "Não tratar como usuário inativo automaticamente. Use a timeline para confirmar o tipo de acesso e normalize last_login_at apenas se necessário.",
      confidence: "média",
      evidence: ["last_login_at ausente", ...activityEvidence.evidence],
    };
  }

  if (hasFailedCommunication) {
    return {
      severity: "warning",
      title: "Falha recente em comunicação",
      cause: "Há registros de comunicação com erro/falha para este usuário.",
      action: "Abrir bloco Comunicações, revisar erro do provider e reenviar por canal alternativo.",
      confidence: "média",
      evidence: ["communication_logs contém falha ou erro"],
    };
  }

  if (activeStatuses.has(subscription?.status)) {
    return {
      severity: "success",
      title: "Jornada saudável",
      cause: "Assinatura ativa/trialing e sem problema crítico detectado na leitura administrativa.",
      action: "Acompanhar engajamento, uso de kits e oportunidades de upgrade/retenção.",
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
  const migrated = isLegacyMember(profile, subscription);
  const activityEvidence = getActivityEvidence(profile, journey);
  const loginStatus: JourneyStatus = profile?.last_login_at ? "concluído" : activityEvidence.hasAny ? "informação" : "pendente";
  const loginDetail = profile?.last_login_at
    ? safeDate(profile.last_login_at)
    : activityEvidence.hasAny
      ? "Há sinais de uso/migração, mas last_login_at está vazio"
      : "Sem login ou atividade detectada";

  return [
    { label: "Perfil criado", status: profile?.created_at ? "concluído" : "ausente", detail: safeDate(profile?.created_at) },
    { label: "Senha configurada", status: profile?.password_setup_completed_at ? "concluído" : activityEvidence.evidence.some((item) => item.includes("senha") || item.includes("password_setup")) ? "informação" : profile?.requires_password_setup ? "pendente" : "informação", detail: profile?.password_setup_completed_at ? safeDate(profile.password_setup_completed_at) : activityEvidence.evidence.find((item) => item.includes("senha") || item.includes("password_setup")) ?? "Sem data registrada" },
    { label: "E-mail confirmado", status: profile?.onboarding_status === "pending_email_confirmation" ? "pendente" : "informação", detail: profile?.onboarding_status === "pending_email_confirmation" ? "Aguardando confirmação de e-mail" : profile?.onboarding_status ?? "Sem status específico" },
    { label: "Assinatura criada", status: subscription?.created_at ? "concluído" : "ausente", detail: safeDate(subscription?.created_at) },
    { label: "Stripe Customer vinculado", status: migrated ? "não aplicável" : stripeCustomer ? "concluído" : "ausente", detail: migrated ? "Plano legado/PMS não exige customer Stripe" : stripeCustomer ?? "Sem customer" },
    { label: "Stripe Subscription vinculada", status: migrated ? "não aplicável" : stripeSubscription ? "concluído" : stripeCustomer ? "erro" : "ausente", detail: migrated ? "Plano legado/PMS não exige subscription Stripe" : stripeSubscription ?? "Sem subscription" },
    { label: "Plano ativo", status: activeStatuses.has(subscription?.status) ? "concluído" : subscription?.status === "pending" ? "pendente" : "ausente", detail: subscription?.status ?? "Sem assinatura" },
    { label: "Primeiro login realizado", status: loginStatus, detail: loginDetail },
    { label: "Primeiro acesso a kit", status: journey.kitAccessLogs.length ? "concluído" : "ausente", detail: journey.kitAccessLogs.length ? safeDate(getEarliestDate(journey.kitAccessLogs, ["accessed_at"])) : "Sem acesso registrado" },
    { label: "Primeiro áudio reproduzido", status: journey.audioAccessLogs.some((log: any) => log.status !== "denied") ? "concluído" : journey.audioAccessLogs.length ? "erro" : "ausente", detail: journey.audioAccessLogs.length ? safeDate(getEarliestDate(journey.audioAccessLogs, ["accessed_at"])) : "Sem áudio registrado" },
    { label: "Comunicação enviada", status: journey.communicationLogs.some((log: any) => ["enviado", "entregue", "abriu", "clicou", "respondeu"].includes(log.status)) ? "concluído" : journey.communicationLogs.some((log: any) => log.status === "falhou") ? "erro" : "ausente", detail: journey.communicationLogs[0]?.status ?? "Sem comunicação" },
  ] as Array<{ label: string; status: JourneyStatus; detail: string }>;
}

function calculateScores(checklist: Array<{ status: JourneyStatus }>, diagnosis: JourneyDiagnosis | null, journey: Awaited<ReturnType<typeof getSubscriberJourneyData>>, subscription: any) {
  const applicableChecklist = checklist.filter((item) => item.status !== "não aplicável");
  const done = applicableChecklist.filter((item) => item.status === "concluído").length;
  const info = applicableChecklist.filter((item) => item.status === "informação").length;
  const errors = applicableChecklist.filter((item) => item.status === "erro").length;
  const pending = applicableChecklist.filter((item) => item.status === "pendente").length;
  const engagementSignals = Math.min(4, Number(Boolean(subscription?.status === "active" || subscription?.status === "trialing")) + Number(Boolean(journey.kitAccessLogs.length)) + Number(Boolean(journey.audioAccessLogs.length)) + Number(Boolean(journey.communicationLogs.length)));
  const engagement = Math.min(100, Math.round(((done + info * 0.35) / Math.max(applicableChecklist.length, 1)) * 70 + engagementSignals * 7.5));
  const riskBase = diagnosis?.severity === "critical" ? 85 : diagnosis?.severity === "warning" ? 60 : diagnosis?.severity === "info" ? 35 : 15;
  const risk = Math.min(100, Math.max(0, riskBase + errors * 10 + pending * 4 - engagementSignals * 6));
  const conversion = Math.min(100, Math.round(((done + info * 0.35) / Math.max(applicableChecklist.length, 1)) * 100));
  return { engagement, risk, conversion };
}

function scoreColor(score: number, inverted = false) {
  const good = inverted ? score <= 30 : score >= 70;
  const mid = inverted ? score <= 60 : score >= 45;
  if (good) return "text-emerald-200 border-emerald-400/30 bg-emerald-500/10";
  if (mid) return "text-amber-200 border-amber-400/30 bg-amber-500/10";
  return "text-red-200 border-red-400/30 bg-red-500/10";
}

function addTimelineEvent(events: JourneyTimelineEvent[], event: JourneyTimelineEvent) {
  if (!event.at) return;
  events.push(event);
}

function buildTimeline(profile: any, subscription: any, journey: Awaited<ReturnType<typeof getSubscriberJourneyData>>) {
  const events: JourneyTimelineEvent[] = [];
  addTimelineEvent(events, { at: profile?.created_at, type: "Perfil", description: "Perfil criado", source: "profiles.created_at", status: "concluído", details: profile });
  addTimelineEvent(events, { at: profile?.password_setup_completed_at, type: "Onboarding", description: "Senha configurada", source: "profiles.password_setup_completed_at", status: "concluído", details: { password_setup_completed_at: profile?.password_setup_completed_at } });
  addTimelineEvent(events, { at: profile?.last_login_at, type: "Login", description: "Primeiro/último login registrado", source: "profiles.last_login_at", status: "concluído", details: { last_login_at: profile?.last_login_at } });
  addTimelineEvent(events, { at: subscription?.created_at, type: "Assinatura", description: `Assinatura criada (${subscription?.status ?? "sem status"})`, source: "subscriptions.created_at", status: subscription?.status ?? "informação", details: subscription });
  addTimelineEvent(events, { at: subscription?.updated_at, type: "Assinatura", description: "Assinatura atualizada", source: "subscriptions.updated_at", status: subscription?.status ?? "informação", details: subscription });

  for (const log of journey.webhookLogs) addTimelineEvent(events, { at: log.created_at, type: "Webhook", description: log.event ?? log.delivery_id ?? "Webhook recebido", source: "webhook_logs", status: log.success === false ? "erro" : "concluído", details: log });
  for (const event of journey.webhookProcessedEvents) addTimelineEvent(events, { at: event.processed_at ?? event.created_at, type: "Webhook processado", description: event.event_type ?? event.event_id ?? "Evento processado", source: "webhook_processed_events", status: "concluído", details: event });
  for (const log of journey.communicationLogs) addTimelineEvent(events, { at: log.created_at, type: "Comunicação", description: `${log.channel ?? "canal"} ${log.status ?? "registrado"}`, source: "communication_logs", status: log.status ?? "informação", details: log });
  for (const log of journey.kitAccessLogs) addTimelineEvent(events, { at: log.accessed_at ?? log.created_at, type: "Acesso a kit", description: `Kit ${log.kit_id ?? "acessado"}`, source: "kit_access_logs", status: log.status ?? "concluído", details: log });
  for (const log of journey.audioAccessLogs) addTimelineEvent(events, { at: log.accessed_at ?? log.created_at, type: "Áudio", description: `Áudio ${log.audio_file_id ?? "reproduzido"}`, source: "audio_access_logs", status: log.status ?? "concluído", details: log });

  return events.sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()).slice(0, 80);
}

function getCampaignSegment(diagnosis: JourneyDiagnosis | null, subscription: any) {
  if (subscription?.status === "pending") return "pending";
  if (["canceled", "inactive", "expired"].includes(normalize(subscription?.status))) return "churn";
  if (diagnosis?.title?.includes("login")) return "first_access";
  if (diagnosis?.title?.includes("Stripe")) return "stripe_review";
  return "member_followup";
}

function whatsappHref(phone: unknown, fallbackText: string) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(fallbackText)}`;
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <p className="break-words text-sm text-muted">
      <strong className="text-white">{label}:</strong> {String(value ?? "—")}
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

function ScoreCard({ label, value, detail, icon: Icon, inverted = false }: { label: string; value: number; detail: string; icon: any; inverted?: boolean }) {
  return (
    <article className={`rounded-3xl border p-5 shadow-premium ${scoreColor(value, inverted)}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.22em] opacity-80">{label}</p>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-3xl font-semibold text-white">{value}%</p>
      <div className="mt-3 h-2 rounded-full bg-black/30">
        <div className="h-2 rounded-full bg-current" style={{ width: `${Math.max(4, value)}%` }} />
      </div>
      <p className="mt-2 text-xs opacity-80">{detail}</p>
    </article>
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
  const username = getMetadataValue(profile, "username") ?? "—";
  const phone = profile?.phone ?? getMetadataValue(profile, "phone") ?? "";
  const checklist = journey && profile ? buildChecklist(profile, subscription, journey) : [];
  const timeline = journey && profile ? buildTimeline(profile, subscription, journey) : [];
  const latestWebhook = journey?.webhookProcessedEvents[0] ?? journey?.webhookLogs[0] ?? null;
  const diagnosis = journey && profile ? buildDiagnosis(profile, subscription, journey) : null;
  const currentProblem = diagnosis?.title ?? "Dados insuficientes";
  const scores = journey && profile ? calculateScores(checklist, diagnosis, journey, subscription) : { engagement: 0, risk: 100, conversion: 0 };
  const segment = getCampaignSegment(diagnosis, subscription);
  const campaignHref = `/admin/comunicacao/campaigns?segment=${encodeURIComponent(segment)}&email=${encodeURIComponent(profile?.email ?? "")}`;
  const whatsHref = whatsappHref(phone, `Olá! Passando para te ajudar com seu acesso ao Harmomus. Vi aqui que precisamos conferir sua etapa: ${currentProblem}.`);

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
        <Link href="/admin/membros" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar para membros
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader title="CRM do Membro" description="Diagnóstico completo da jornada, engajamento, risco e intervenções do usuário." />
        <Link href="/admin/membros" className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-gold-500/20 bg-gradient-to-br from-gold-500/10 via-surface to-background shadow-premium">
        <div className="flex flex-col gap-6 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-gold-300">Jornada individual</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{profile.full_name ?? "Sem nome"}</h2>
            <p className="mt-1 text-sm text-muted">{profile.email ?? "Sem e-mail"} · {phone || "sem telefone"}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusBadgeClass(currentStatus)}`}>{currentStatus}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">{member.plan?.name ?? "Free"}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">{subscription?.gateway ?? subscription?.original_gateway ?? "sem gateway"}</span>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[420px]">
            <Link href={campaignHref} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gold-400/30 bg-gold-500/10 px-4 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/20">
              <MailPlus className="h-4 w-4" /> Enviar campanha
            </Link>
            {whatsHref ? (
              <a href={whatsHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20">
                <MessageCircle className="h-4 w-4" /> Chamar no WhatsApp
              </a>
            ) : (
              <span className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted">
                <MessageCircle className="h-4 w-4" /> Sem telefone
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ScoreCard label="Engajamento" value={scores.engagement} detail="Login, kits, áudios, comunicação e assinatura." icon={TrendingUp} />
        <ScoreCard label="Risco" value={scores.risk} detail="Quanto maior, mais urgente a intervenção." icon={AlertTriangle} inverted />
        <ScoreCard label="Jornada" value={scores.conversion} detail="Percentual de etapas essenciais concluídas." icon={Target} />
      </div>

      {diagnosis ? (
        <div className={`rounded-3xl border p-5 shadow-premium ${severityClass(diagnosis.severity)}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] opacity-80">Centro de Diagnóstico</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{diagnosis.title}</h3>
              <p className="mt-2 text-sm leading-6 opacity-90"><strong>Causa provável:</strong> {diagnosis.cause}</p>
              <p className="mt-1 text-sm leading-6 opacity-90"><strong>Ação sugerida:</strong> {diagnosis.action}</p>
            </div>
            <div className="grid min-w-[220px] gap-2 text-sm">
              <span className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">Severidade: <strong>{diagnosis.severity}</strong></span>
              <span className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">Confiança: <strong>{diagnosis.confidence}</strong></span>
              <Link href={campaignHref} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-center font-semibold text-white transition hover:bg-white/10">Intervir agora</Link>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {diagnosis.evidence.map((item) => (
              <p key={item} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs opacity-90">{item}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><UserRound className="h-5 w-5 text-gold-300" /> Perfil e origem</h3>
          <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-2">
            <Field label="Nome" value={profile.full_name} />
            <Field label="E-mail" value={profile.email} />
            <Field label="Username" value={username} />
            <Field label="Telefone" value={phone || "—"} />
            <Field label="Cadastro" value={safeDate(profile.created_at)} />
            <Field label="Atualizado" value={safeDate(profile.updated_at)} />
            <Field label="Último login" value={safeDate(profile.last_login_at)} />
            <Field label="Origem" value={isLegacyMember(profile, subscription) ? "Usuário migrado/legado" : "Novo cadastro"} />
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><CreditCard className="h-5 w-5 text-cyan-300" /> Assinatura e cobrança</h3>
          <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-2">
            <Field label="Plano atual" value={member.plan?.name ?? "Free"} />
            <Field label="Status" value={currentStatus} />
            <Field label="Gateway" value={subscription?.gateway ?? subscription?.original_gateway} />
            <Field label="Stripe Customer" value={isLegacyMember(profile, subscription) ? "Não aplicável ao legado/PMS" : subscription?.stripe_customer_id ?? subscription?.gateway_customer_id} />
            <Field label="Stripe Sub" value={isLegacyMember(profile, subscription) ? "Não aplicável ao legado/PMS" : subscription?.stripe_subscription_id ?? subscription?.gateway_subscription_id} />
            <Field label="Stripe Price" value={subscription?.stripe_price_id} />
            <Field label="Próx. cobrança" value={safeDate(subscription?.next_billing_at ?? subscription?.current_period_end)} />
            <Field label="Auto renovação" value={formatBoolean(subscription?.auto_renew)} />
          </div>
        </div>
      </div>

      <section id="jornada-assinante" className="space-y-5 rounded-[2rem] border border-gold-500/30 bg-gradient-to-br from-gold-500/10 via-surface to-background p-5 shadow-premium sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-gold-300">Mapa visual</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Funil do membro</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Confirme exatamente onde ele avançou, onde travou e qual evidência existe em cada etapa.</p>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(diagnosis?.severity)}`}>{currentProblem}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {checklist.map((item, index) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs text-white">{index + 1}</span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(item.status)}`}>{item.status}</span>
              </div>
              <p className="mt-3 font-medium text-white">{item.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><MailPlus className="h-5 w-5 text-gold-300" /> Intervenções recomendadas</h3>
          <div className="mt-4 grid gap-3">
            <Link href={campaignHref} className="rounded-2xl border border-gold-400/30 bg-gold-500/10 p-4 text-sm text-gold-100 transition hover:bg-gold-500/20">
              <strong>Campanha sugerida:</strong> {segment}. Use esta ação para falar com o membro de acordo com a etapa atual.
            </Link>
            {whatsHref ? (
              <a href={whatsHref} target="_blank" rel="noreferrer" className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100 transition hover:bg-emerald-500/20">
                <strong>WhatsApp:</strong> chamar agora com uma mensagem contextualizada sobre o bloqueio atual.
              </a>
            ) : null}
            <Link href="/admin/comunicacao/templates" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-200 transition hover:bg-white/[0.06]">
              <strong>Templates:</strong> revisar modelos de recuperação, primeiro acesso, upgrade e reativação.
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><Activity className="h-5 w-5 text-violet-300" /> Atividade recente</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Último kit" value={safeDate(getLatestDate(journey.kitAccessLogs, ["accessed_at"]))} />
            <Field label="Último áudio" value={safeDate(getLatestDate(journey.audioAccessLogs, ["accessed_at"]))} />
            <Field label="Última comunicação" value={safeDate(getLatestDate(journey.communicationLogs, ["created_at", "sent_at"]))} />
            <Field label="Último webhook" value={safeDate(latestWebhook?.processed_at ?? latestWebhook?.created_at)} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-white"><PlayCircle className="h-4 w-4 text-cyan-300" /> Kits acessados</p>
              <p className="mt-2 text-2xl font-semibold text-white">{journey.kitAccessLogs.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-white"><Zap className="h-4 w-4 text-gold-300" /> Áudios tocados</p>
              <p className="mt-2 text-2xl font-semibold text-white">{journey.audioAccessLogs.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><ShieldCheck className="h-5 w-5 text-emerald-300" /> Stripe e legado</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="gateway_customer_id" value={subscription?.gateway_customer_id} />
            <Field label="gateway_subscription_id" value={subscription?.gateway_subscription_id} />
            <Field label="legacy_pms_member_id" value={profile.legacy_pms_member_id} />
            <Field label="legacy_pms_subscription_id" value={subscription?.legacy_pms_subscription_id} />
            <Field label="migrated_from_pms" value={formatBoolean(profile.migrated_from_pms || subscription?.migrated_from_pms)} />
            <Field label="last_webhook_event" value={subscription?.last_webhook_event} />
          </div>
          <div className="mt-4 space-y-3">
            {journey.legacyPmsSubscriptions.length ? journey.legacyPmsSubscriptions.slice(0, 3).map((row, index) => <JsonDetails key={`legacy-pms-${index}`} value={row} />) : <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted">Nenhum dado localizado em legacy_pms_subscriptions pelos fallbacks seguros.</p>}
            {(journey.legacyStripeCustomers.length || journey.legacyStripeCustomerImports.length) ? <JsonDetails value={{ legacy_stripe_customers: journey.legacyStripeCustomers, legacy_stripe_customer_import: journey.legacyStripeCustomerImports }} /> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><CalendarClock className="h-5 w-5 text-amber-300" /> Comunicações e acessos</h3>
          <div className="mt-4 space-y-3">
            {journey.communicationLogs.length ? journey.communicationLogs.slice(0, 8).map((log: any) => (
              <div key={log.id ?? JSON.stringify(log)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-white">{log.channel === "whatsapp" ? "WhatsApp" : "E-mail"}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${statusBadgeClass(log.status)}`}>{log.status ?? "informação"}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{safeDate(log.created_at)} · {log.provider_message_id ?? "sem provider_message_id"}</p>
                {(log.error || log.error_message || log.details?.error) ? <p className="mt-2 text-xs text-red-200">Erro: {log.error ?? log.error_message ?? log.details?.error}</p> : null}
              </div>
            )) : <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted">Nenhuma comunicação encontrada para este usuário.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
        <h3 className="text-lg font-semibold text-white">Timeline cronológica consolidada</h3>
        <div className="mt-5 space-y-3">
          {timeline.length ? timeline.map((event, index) => (
            <article key={`${event.source}-${event.at}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">{safeDate(event.at)} · {event.source}</p>
                  <h4 className="mt-1 font-semibold text-white">{event.type}</h4>
                  <p className="mt-1 text-sm text-muted">{event.description}</p>
                </div>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs ${statusBadgeClass(event.status)}`}>{event.status}</span>
              </div>
              <JsonDetails value={event.details} />
            </article>
          )) : <p className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm text-muted">Nenhum evento encontrado na jornada pelos fallbacks seguros.</p>}
        </div>
      </div>

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
