import type { MemberListItem, SubscriberJourneyData } from "@/lib/data/members";

export type MemberHealthLabel = "Saudável" | "Atenção" | "Risco" | "Crítico";
export type MemberHealthSeverity = "success" | "info" | "warning" | "critical";
export type RecommendedActionType = "manual" | "external" | "future_action";
export type RecommendedActionPriority = "high" | "medium" | "low";
export type OperationalFlag =
  | "pending"
  | "profile_not_synced"
  | "no_login"
  | "no_real_access"
  | "no_stripe_subscription"
  | "failed_communication"
  | "no_kit_access"
  | "no_audio_access"
  | "migrated_from_pms"
  | "healthy"
  | "critical";

export type MemberHealthResult = {
  score: number;
  label: MemberHealthLabel;
  severity: MemberHealthSeverity;
  reasons: string[];
};

export type MemberDiagnosis = {
  severity: MemberHealthSeverity;
  title: string;
  cause: string;
  action: string;
  confidence: "baixa" | "média" | "alta";
  evidence: string[];
};

export type RecommendedAction = {
  label: string;
  description: string;
  type: RecommendedActionType;
  priority: RecommendedActionPriority;
};

type JourneyLike = Partial<SubscriberJourneyData> | null | undefined;

type MemberLike = MemberListItem | {
  profile?: Record<string, any> | null;
  subscription?: Record<string, any> | null;
  plan?: Record<string, any> | null;
};

const POSITIVE_COMMUNICATION_STATUSES = new Set(["enviado", "entregue", "abriu", "clicou", "respondeu", "sent", "delivered", "opened", "clicked", "replied", "success"]);
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const FAILED_COMMUNICATION_STATUSES = new Set(["falhou", "failed", "erro", "error", "bounced"]);
const CONTENT_ENGAGEMENT_GRACE_DAYS = 14;

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isPresent(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function rows(journey: JourneyLike, key: keyof SubscriberJourneyData) {
  const value = journey?.[key];
  return Array.isArray(value) ? value : [];
}

function getRowDate(row: any) {
  return row?.processed_at ?? row?.created_at ?? row?.updated_at ?? row?.accessed_at ?? row?.sent_at ?? null;
}

function hasRecentRow(items: any[], days: number) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.some((row) => {
    const value = getRowDate(row);
    if (!value) return false;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= since;
  });
}

function getStripeCustomer(subscription: any) {
  return subscription?.stripe_customer_id ?? subscription?.gateway_customer_id ?? null;
}

function getStripeSubscription(subscription: any) {
  return subscription?.stripe_subscription_id ?? subscription?.gateway_subscription_id ?? null;
}

function isMigratedFromPms(member: MemberLike, journey: JourneyLike) {
  const profile = member.profile as any;
  const subscription = member.subscription as any;
  const gateway = normalize(subscription?.gateway);
  const originalGateway = normalize(subscription?.original_gateway);

  return Boolean(
    profile?.migrated_from_pms ||
      subscription?.migrated_from_pms ||
      profile?.legacy_pms_member_id ||
      subscription?.legacy_pms_subscription_id ||
      rows(journey, "legacyPmsSubscriptions").length ||
      gateway === "legacy" ||
      gateway === "migration" ||
      gateway === "pms" ||
      originalGateway === "pms",
  );
}

function hasEmailConfirmed(profile: any) {
  return Boolean(profile?.email_confirmed_at || profile?.confirmed_at);
}

function hasPasswordConfigured(profile: any) {
  return Boolean(
    profile?.password_setup_completed_at ||
      profile?.password_configured_at ||
      hasEmailConfirmed(profile) ||
      profile?.requires_password_setup === false,
  );
}

function hasProfileLogin(profile: any) {
  return Boolean(profile?.last_login_at || profile?.last_seen_at);
}

function hasAuthLogin(profile: any) {
  return Boolean(profile?.last_sign_in_at);
}

function hasLogin(profile: any) {
  return hasProfileLogin(profile) || hasAuthLogin(profile);
}

function daysSince(value: unknown) {
  if (!value) return null;
  const time = new Date(String(value)).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

function isPaidPlan(member: MemberLike) {
  const plan = member.plan as any;
  const slug = normalize(plan?.slug);
  const priceCents = Number(plan?.price_cents ?? 0);
  return slug !== "free" && priceCents > 0;
}

function shouldEvaluateContentEngagement(member: MemberLike) {
  const profile = member.profile as any;
  if (!isPaidPlan(member)) return false;
  if (!hasLogin(profile)) return false;

  const ageDays = daysSince(profile?.created_at);
  return ageDays === null || ageDays >= CONTENT_ENGAGEMENT_GRACE_DAYS;
}

function communicationFailed(journey: JourneyLike) {
  return rows(journey, "communicationLogs").some((log: any) => {
    const status = normalize(log?.status ?? log?.event ?? log?.level);
    return FAILED_COMMUNICATION_STATUSES.has(status) || normalize(log?.level) === "error" || Boolean(log?.error || log?.error_message || log?.details?.error);
  });
}

function communicationSucceeded(journey: JourneyLike) {
  return rows(journey, "communicationLogs").some((log: any) => POSITIVE_COMMUNICATION_STATUSES.has(normalize(log?.status ?? log?.event ?? log?.level)));
}

function getBand(score: number): Pick<MemberHealthResult, "label" | "severity"> {
  if (score >= 90) return { label: "Saudável", severity: "success" };
  if (score >= 70) return { label: "Atenção", severity: "info" };
  if (score >= 40) return { label: "Risco", severity: "warning" };
  return { label: "Crítico", severity: "critical" };
}

export function calculateMemberHealth(member: MemberLike, journey?: JourneyLike): MemberHealthResult {
  const profile = member.profile as any;
  const subscription = member.subscription as any;
  const status = normalize(subscription?.status);
  const stripeCustomer = getStripeCustomer(subscription);
  const stripeSubscription = getStripeSubscription(subscription);
  const migrated = isMigratedFromPms(member, journey);
  const hasKitAccess = rows(journey, "kitAccessLogs").length > 0;
  const hasAudioAccess = rows(journey, "audioAccessLogs").some((log: any) => normalize(log?.status) !== "denied");
  const hasRecentWebhook = hasRecentRow([...rows(journey, "webhookLogs"), ...rows(journey, "webhookProcessedEvents")], 30);
  const failedCommunication = communicationFailed(journey);
  const evaluateContentEngagement = shouldEvaluateContentEngagement(member);

  let score = 0;
  const reasons: string[] = [];

  if (ACTIVE_STATUSES.has(status)) {
    score += 20;
    reasons.push("+20 assinatura active/trialing");
  }

  if (isPresent(stripeSubscription) || migrated) {
    score += 15;
    reasons.push(migrated ? "+15 vínculo legado/PMS reconhecido" : "+15 Stripe Subscription vinculada");
  }

  if (hasPasswordConfigured(profile)) {
    score += 10;
    reasons.push("+10 senha configurada");
  }

  if (hasLogin(profile)) {
    score += 15;
    reasons.push("+15 primeiro login detectado");
  }

  if (hasKitAccess) {
    score += 10;
    reasons.push("+10 acesso a kit");
  }

  if (hasAudioAccess) {
    score += 10;
    reasons.push("+10 áudio reproduzido");
  }

  if (communicationSucceeded(journey)) {
    score += 10;
    reasons.push("+10 comunicação enviada/entregue");
  }

  if (hasRecentWebhook) {
    score += 10;
    reasons.push("+10 webhook recente nos últimos 30 dias");
  }

  if (!migrated && isPresent(stripeCustomer) && !isPresent(stripeSubscription)) {
    score -= 30;
    reasons.push("-30 Stripe Customer existe mas Stripe Subscription está ausente");
  }

  if (status === "pending" && !migrated) {
    score -= 20;
    reasons.push("-20 assinatura pending");
  }

  if (status === "pending" && migrated) {
    reasons.push("Assinatura pending de legado/PMS exige conferência de ativação");
  }

  if (failedCommunication) {
    score -= 20;
    reasons.push("-20 falha em comunicação");
  }

  if (!hasLogin(profile)) {
    score -= 15;
    reasons.push("-15 sem evidência de login registrada");
  }

  if (evaluateContentEngagement && (!hasKitAccess || !hasAudioAccess)) {
    score -= 5;
    reasons.push(`-5 sem consumo de kit/áudio após ${CONTENT_ENGAGEMENT_GRACE_DAYS} dias`);
  } else if (isPaidPlan(member) && hasLogin(profile) && (!hasKitAccess || !hasAudioAccess)) {
    reasons.push(`Consumo de kit/áudio ainda em janela inicial de ${CONTENT_ENGAGEMENT_GRACE_DAYS} dias`);
  }

  const clamped = Math.max(0, Math.min(100, score));
  const band = getBand(clamped);

  if (!hasLogin(profile) && hasEmailConfirmed(profile) && band.severity === "critical") {
    const hasCriticalPaymentIssue = !migrated && isPresent(stripeCustomer) && !isPresent(stripeSubscription) && status === "pending";
    if (!hasCriticalPaymentIssue) {
      return { score: clamped, label: "Risco", severity: "warning", reasons };
    }
  }

  return { score: clamped, ...band, reasons };
}

export function getOperationalFlags(member: MemberLike, journey?: JourneyLike): OperationalFlag[] {
  const profile = member.profile as any;
  const subscription = member.subscription as any;
  const status = normalize(subscription?.status);
  const stripeCustomer = getStripeCustomer(subscription);
  const stripeSubscription = getStripeSubscription(subscription);
  const migrated = isMigratedFromPms(member, journey);
  const health = calculateMemberHealth(member, journey);
  const flags: OperationalFlag[] = [];
  const evaluateContentEngagement = shouldEvaluateContentEngagement(member);

  if (status === "pending") flags.push("pending");
  if (!hasProfileLogin(profile) && hasAuthLogin(profile)) flags.push("profile_not_synced");
  if (!hasLogin(profile)) flags.push("no_real_access");
  if (!migrated && isPresent(stripeCustomer) && !isPresent(stripeSubscription)) flags.push("no_stripe_subscription");
  if (communicationFailed(journey)) flags.push("failed_communication");
  if (evaluateContentEngagement && !rows(journey, "kitAccessLogs").length) flags.push("no_kit_access");
  if (evaluateContentEngagement && !rows(journey, "audioAccessLogs").length) flags.push("no_audio_access");
  if (migrated) flags.push("migrated_from_pms");
  if (health.score >= 90 && !flags.some((flag) => flag !== "migrated_from_pms")) flags.push("healthy");
  if (health.severity === "critical") flags.push("critical");

  return flags;
}

export function getRecommendedActions(member: MemberLike, journey?: JourneyLike): RecommendedAction[] {
  const profile = member.profile as any;
  const subscription = member.subscription as any;
  const status = normalize(subscription?.status);
  const stripeCustomer = getStripeCustomer(subscription);
  const stripeSubscription = getStripeSubscription(subscription);
  const migrated = isMigratedFromPms(member, journey);
  const actions: RecommendedAction[] = [];

  if (status === "pending" && migrated) {
    actions.push(
      { label: "Conferir ativação legado/PMS", description: "Legado/PMS reconhecido — conferir ativação no PMS/migração antes de tratar como checkout abandonado.", type: "manual", priority: "high" },
      { label: "Validar status importado", description: "Cruzar gateway, migrated_from_pms e identificadores PMS sem ativar assinatura automaticamente.", type: "manual", priority: "medium" },
    );
  }

  if (!migrated && isPresent(stripeCustomer) && !isPresent(stripeSubscription)) {
    actions.push(
      { label: "Conferir assinatura no Stripe", description: "Abrir o customer no Stripe e confirmar se existe subscription válida e paga antes de qualquer ajuste manual.", type: "external", priority: "high" },
      { label: "Sincronizar subscription Stripe", description: "Ação futura/operacional: registrar a subscription ausente somente após confirmação do pagamento.", type: "future_action", priority: "high" },
      { label: "Não ativar manualmente antes de confirmar pagamento", description: "Evita liberar acesso pago com customer incompleto ou checkout ainda não finalizado.", type: "manual", priority: "high" },
    );
  }

  if (status === "pending" && !migrated) {
    actions.push(
      { label: "Verificar último webhook", description: "Conferir eventos recentes do gateway para entender se houve atraso, falha ou ausência de processamento.", type: "manual", priority: "high" },
      { label: "Conferir se pagamento foi aprovado", description: "Validar a cobrança no provedor antes de alterar o status da assinatura.", type: "external", priority: "high" },
      { label: "Validar se assinatura deveria estar ativa", description: "Cruzar status local, Stripe/PMS e comunicação antes de intervir.", type: "manual", priority: "medium" },
    );
  }

  if (!hasLogin(profile)) {
    if (hasEmailConfirmed(profile)) {
      actions.push(
        { label: "Orientar primeiro login", description: "E-mail já confirmado, mas sem last_sign_in_at/last_login_at/last_seen_at; enviar instruções de acesso sem tratar como incidente crítico por padrão.", type: "manual", priority: "medium" },
        { label: "Conferir evidências de acesso", description: "Verificar Auth/Profile antes de concluir que o usuário nunca acessou.", type: "manual", priority: "medium" },
      );
    } else {
      actions.push(
        { label: "Reenviar confirmação de e-mail", description: "Cadastro sem confirmação de e-mail e sem login registrado; orientar confirmação antes de investigar ausência de acesso.", type: "manual", priority: "medium" },
        { label: "Conferir evidências de acesso", description: "Verificar Auth/Profile antes de concluir que o usuário nunca acessou.", type: "manual", priority: "medium" },
        { label: "Confirmar se senha foi configurada", description: "Verificar evidências de configuração de senha antes de concluir que o usuário abandonou.", type: "manual", priority: "low" },
      );
    }
  }

  if (communicationFailed(journey)) {
    actions.push(
      { label: "Verificar provider_message_id", description: "Usar o identificador do provedor para rastrear rejeição, bounce ou erro de entrega.", type: "external", priority: "high" },
      { label: "Reenviar comunicação", description: "Reenvio é apenas recomendação visual nesta etapa; use os fluxos manuais já existentes.", type: "future_action", priority: "medium" },
      { label: "Checar erro do provedor", description: "Revisar mensagem de erro e canal alternativo antes de insistir no mesmo envio.", type: "manual", priority: "medium" },
    );
  }

  if (shouldEvaluateContentEngagement(member) && (!rows(journey, "kitAccessLogs").length || !rows(journey, "audioAccessLogs").length)) {
    actions.push(
      { label: "Estimular consumo de conteúdo", description: "Usuário pago com login registrado, mas sem consumo de kit/áudio após a janela inicial. Enviar orientação de uso.", type: "manual", priority: "medium" },
      { label: "Orientar primeiro acesso aos kits", description: "Enviar passo a passo simples para abrir a biblioteca, acessar kits e reproduzir o primeiro áudio.", type: "manual", priority: "low" },
    );
  }

  if (!actions.length) {
    actions.push({ label: "Acompanhar jornada", description: "Conta sem incidente operacional crítico. Monitorar engajamento, uso de kits e oportunidades de retenção.", type: "manual", priority: "low" });
  }

  const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
  return actions.sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);
}

export function getMemberDiagnosis(member: MemberLike, journey?: JourneyLike): MemberDiagnosis {
  const profile = member.profile as any;
  const subscription = member.subscription as any;
  const status = normalize(subscription?.status);
  const stripeCustomer = getStripeCustomer(subscription);
  const stripeSubscription = getStripeSubscription(subscription);
  const migrated = isMigratedFromPms(member, journey);
  const health = calculateMemberHealth(member, journey);
  const actions = getRecommendedActions(member, journey);

  if (status === "pending" && migrated) {
    return {
      severity: "info",
      title: "Legado/PMS reconhecido — conferir ativação",
      cause: "A assinatura está pending, mas há evidência de gateway legado/migração/PMS; não deve ser tratada automaticamente como checkout abandonado Stripe.",
      action: actions[0]?.description ?? "Conferir ativação no PMS/migração antes de intervir.",
      confidence: "alta",
      evidence: [
        `Status atual: ${subscription?.status}`,
        `Gateway: ${subscription?.gateway ?? "não registrado"}`,
        `migrated_from_pms: ${Boolean((member.profile as any)?.migrated_from_pms || subscription?.migrated_from_pms)}`,
      ],
    };
  }

  if (!migrated && isPresent(stripeCustomer) && !isPresent(stripeSubscription)) {
    return {
      severity: status === "pending" ? "critical" : "warning",
      title: "Customer Stripe sem subscription vinculada",
      cause: "Customer Stripe existe, mas a subscription ainda não foi registrada ou sincronizada no Harmomus.",
      action: actions[0]?.description ?? "Conferir a assinatura no Stripe antes de qualquer ativação manual.",
      confidence: "alta",
      evidence: [`Status atual: ${subscription?.status ?? "sem assinatura"}`, `Stripe customer: ${stripeCustomer}`, "Stripe subscription: ausente"],
    };
  }

  if (status === "pending") {
    return {
      severity: "warning",
      title: "Assinatura pendente de ativação",
      cause: "Existe assinatura registrada, mas ela ainda não está ativa/trialing.",
      action: actions[0]?.description ?? "Revisar último webhook e confirmação de pagamento.",
      confidence: "alta",
      evidence: [`Status atual: ${subscription?.status}`, `Último evento: ${subscription?.last_webhook_event ?? "não registrado"}`],
    };
  }

  if (!hasLogin(profile)) {
    if (hasEmailConfirmed(profile)) {
      return {
        severity: ACTIVE_STATUSES.has(status) || isPaidPlan(member) ? "warning" : "info",
        title: "E-mail confirmado, mas sem login registrado",
        cause: "O e-mail foi confirmado no Auth, porém ainda não há last_sign_in_at no Auth nem last_login_at/last_seen_at no profile.",
        action: actions.find((action) => action.label === "Orientar primeiro login")?.description ?? "Orientar primeiro login sem classificar como crítico por padrão.",
        confidence: "alta",
        evidence: ["email_confirmed_at/confirmed_at presente", "last_sign_in_at ausente", "last_login_at/last_seen_at ausentes"],
      };
    }

    return {
      severity: "warning",
      title: "Cadastro sem confirmação de e-mail",
      cause: "Não há confirmação de e-mail nem last_sign_in_at no Auth; last_login_at/last_seen_at também estão ausentes no profile.",
      action: actions.find((action) => action.label === "Reenviar confirmação de e-mail")?.description ?? "Orientar confirmação de e-mail antes de concluir ausência real de acesso.",
      confidence: "alta",
      evidence: ["email_confirmed_at/confirmed_at ausentes", "last_sign_in_at ausente", "last_login_at/last_seen_at ausentes"],
    };
  }

  if (communicationFailed(journey)) {
    return {
      severity: "warning",
      title: "Falha recente em comunicação",
      cause: "Há registros de comunicação com erro/falha para este usuário.",
      action: actions.find((action) => action.label === "Verificar provider_message_id")?.description ?? "Revisar erro do provedor.",
      confidence: "média",
      evidence: ["communication_logs contém falha ou erro"],
    };
  }

  if (health.score >= 90) {
    return {
      severity: "success",
      title: "Jornada saudável",
      cause: "Assinatura, acesso e sinais operacionais estão consistentes nos dados disponíveis.",
      action: "Acompanhar engajamento, uso de kits e oportunidades de upgrade/retenção.",
      confidence: "média",
      evidence: [`Score de saúde: ${health.score}/100`, ...health.reasons.slice(0, 3)],
    };
  }

  return {
    severity: health.severity,
    title: `Conta em ${health.label.toLowerCase()}`,
    cause: "O score operacional aponta pendências ou ausência de sinais suficientes para considerar a jornada saudável.",
    action: actions[0]?.description ?? "Conferir timeline, Stripe, comunicações e atividade manualmente.",
    confidence: "média",
    evidence: [`Score de saúde: ${health.score}/100`, ...health.reasons.slice(0, 4)],
  };
}
