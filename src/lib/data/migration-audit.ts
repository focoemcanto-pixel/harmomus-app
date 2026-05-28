import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Severity = "ok" | "warning" | "critical";

type AuditCheck = {
  key: string;
  label: string;
  severity: Severity;
  count: number;
  description: string;
  action: string;
  samples?: Array<Record<string, unknown>>;
};

type AuthUserLite = {
  id: string;
  email?: string | null;
  created_at?: string | null;
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function severityByCount(count: number, severity: Exclude<Severity, "ok"> = "critical"): Severity {
  return count > 0 ? severity : "ok";
}

async function listAllAuthUsers(admin: any) {
  const users: AuthUserLite[] = [];
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Falha ao listar usuários Auth: ${error.message}`);
    const batch = data?.users ?? [];
    users.push(...batch.map((user: any) => ({ id: user.id, email: user.email, created_at: user.created_at })));
    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

function sample<T extends Record<string, unknown>>(items: T[], limit = 8) {
  return items.slice(0, limit);
}

export async function getMigrationReadinessAudit() {
  const admin = createSupabaseAdminClient() as any;

  const [authUsers, profilesResult, subscriptionsResult, plansResult, billingEventsResult] = await Promise.all([
    listAllAuthUsers(admin),
    admin.from("profiles").select("id,email,full_name,role,onboarding_status,onboarding_step,created_at,updated_at"),
    admin.from("subscriptions").select("id,user_id,plan_id,status,gateway,stripe_customer_id,gateway_customer_id,stripe_subscription_id,gateway_subscription_id,stripe_price_id,current_period_end,next_billing_at,trial_ends_at,auto_renew,cancel_at_period_end,created_at,updated_at,last_webhook_event"),
    admin.from("plans").select("id,slug,name,hierarchy_level"),
    admin.from("billing_events").select("id,provider,event_type,processed,created_at,payload").eq("provider", "stripe").order("created_at", { ascending: false }).limit(100),
  ]);

  if (profilesResult.error) throw new Error(`Falha ao auditar profiles: ${profilesResult.error.message}`);
  if (subscriptionsResult.error) throw new Error(`Falha ao auditar subscriptions: ${subscriptionsResult.error.message}`);
  if (plansResult.error) throw new Error(`Falha ao auditar plans: ${plansResult.error.message}`);

  const profiles = profilesResult.data ?? [];
  const subscriptions = subscriptionsResult.data ?? [];
  const plans = plansResult.data ?? [];
  const billingEvents = billingEventsResult.data ?? [];

  const authIdSet = new Set(authUsers.map((user) => user.id));
  const profileIdSet = new Set(profiles.map((profile: any) => profile.id));
  const planById = new Map(plans.map((plan: any) => [String(plan.id), plan]));

  const authWithoutProfile = authUsers
    .filter((user) => !profileIdSet.has(user.id))
    .map((user) => ({ id: user.id, email: user.email ?? null, created_at: user.created_at ?? null }));

  const profileWithoutAuth = profiles
    .filter((profile: any) => profile?.id && !authIdSet.has(profile.id))
    .map((profile: any) => ({ id: profile.id, email: profile.email ?? null, created_at: profile.created_at ?? null }));

  const emailGroups = new Map<string, any[]>();
  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);
    if (!email) continue;
    emailGroups.set(email, [...(emailGroups.get(email) ?? []), profile]);
  }

  const duplicateEmails = Array.from(emailGroups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([email, group]) => ({ email, count: group.length, ids: group.map((item) => item.id) }));

  const orphanSubscriptions = subscriptions
    .filter((sub: any) => sub?.user_id && !profileIdSet.has(sub.user_id))
    .map((sub: any) => ({ id: sub.id, user_id: sub.user_id, status: sub.status, plan_id: sub.plan_id }));

  const paidSubscriptions = subscriptions.filter((sub: any) => {
    const plan = planById.get(String(sub.plan_id));
    return ["plus", "premium", "ministry_10", "ministry_20", "ministry_40"].includes(String(plan?.slug ?? ""));
  });

  const paidPending = paidSubscriptions
    .filter((sub: any) => String(sub.status ?? "").toLowerCase() === "pending")
    .map((sub: any) => ({ id: sub.id, user_id: sub.user_id, status: sub.status, plan: planById.get(String(sub.plan_id))?.slug ?? null, stripe_customer_id: sub.stripe_customer_id ?? null, stripe_subscription_id: sub.stripe_subscription_id ?? null }));

  const paidActiveMissingStripe = paidSubscriptions
    .filter((sub: any) => ["active", "trialing"].includes(String(sub.status ?? "").toLowerCase()) && (!sub.stripe_customer_id || !sub.stripe_subscription_id))
    .map((sub: any) => ({ id: sub.id, user_id: sub.user_id, status: sub.status, plan: planById.get(String(sub.plan_id))?.slug ?? null, stripe_customer_id: sub.stripe_customer_id ?? null, stripe_subscription_id: sub.stripe_subscription_id ?? null }));

  const paidMissingBillingDate = paidSubscriptions
    .filter((sub: any) => ["active", "trialing"].includes(String(sub.status ?? "").toLowerCase()) && !sub.next_billing_at && !sub.current_period_end)
    .map((sub: any) => ({ id: sub.id, user_id: sub.user_id, status: sub.status, plan: planById.get(String(sub.plan_id))?.slug ?? null }));

  const staleWebhookEvents = billingEvents
    .filter((event: any) => event.processed === false)
    .map((event: any) => ({ id: event.id, event_type: event.event_type, created_at: event.created_at }));

  const recentStripeEventTypes = billingEvents.reduce<Record<string, number>>((acc, event: any) => {
    const key = String(event.event_type ?? "unknown");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const expectedStripeEvents = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ];

  const missingRecentStripeEvents = expectedStripeEvents
    .filter((eventType) => !recentStripeEventTypes[eventType])
    .map((eventType) => ({ event_type: eventType }));

  const checks: AuditCheck[] = [
    {
      key: "auth_without_profile",
      label: "Usuários Auth sem profile",
      severity: severityByCount(authWithoutProfile.length),
      count: authWithoutProfile.length,
      description: "Todo usuário autenticado precisa ter uma linha correspondente em profiles para assinatura, permissões e painel funcionarem.",
      action: "Rodar bootstrap/ensureUserAccess para estes usuários antes da migração.",
      samples: sample(authWithoutProfile),
    },
    {
      key: "profile_without_auth",
      label: "Profiles sem usuário Auth",
      severity: severityByCount(profileWithoutAuth.length, "warning"),
      count: profileWithoutAuth.length,
      description: "Profiles órfãos podem aparecer no admin e contaminar migrações/testes.",
      action: "Reconciliar ou remover profiles órfãos, principalmente duplicados de testes.",
      samples: sample(profileWithoutAuth),
    },
    {
      key: "duplicate_emails",
      label: "E-mails duplicados em profiles",
      severity: severityByCount(duplicateEmails.length, "warning"),
      count: duplicateEmails.length,
      description: "Duplicidade de e-mail pode fazer assinatura, limites e acesso apontarem para o usuário errado.",
      action: "Manter apenas o usuário correto por e-mail antes de virar a chave.",
      samples: sample(duplicateEmails),
    },
    {
      key: "orphan_subscriptions",
      label: "Assinaturas órfãs",
      severity: severityByCount(orphanSubscriptions.length),
      count: orphanSubscriptions.length,
      description: "Toda subscription precisa apontar para um profile real.",
      action: "Remover subscriptions órfãs ou recriar o profile correspondente.",
      samples: sample(orphanSubscriptions),
    },
    {
      key: "paid_pending",
      label: "Pagos ainda pendentes",
      severity: severityByCount(paidPending.length),
      count: paidPending.length,
      description: "Planos pagos com status pending não liberam Plus/Premium e indicam falha de sincronização Stripe.",
      action: "Reconciliar com Stripe usando stripe_customer_id/stripe_subscription_id ou refazer checkout.",
      samples: sample(paidPending),
    },
    {
      key: "paid_active_missing_stripe",
      label: "Pagos ativos sem vínculo Stripe",
      severity: severityByCount(paidActiveMissingStripe.length),
      count: paidActiveMissingStripe.length,
      description: "Assinatura paga ativa sem customer/subscription Stripe é inconsistente e não deve ser migrada sem correção.",
      action: "Preencher vínculo real do Stripe ou rebaixar para pending/free até reconciliar.",
      samples: sample(paidActiveMissingStripe),
    },
    {
      key: "paid_missing_billing_date",
      label: "Pagos ativos sem próxima cobrança",
      severity: severityByCount(paidMissingBillingDate.length, "warning"),
      count: paidMissingBillingDate.length,
      description: "Sem próxima cobrança fica impossível dar suporte, cancelar corretamente ou auditar receita.",
      action: "Buscar subscription no Stripe e preencher current_period_end/next_billing_at.",
      samples: sample(paidMissingBillingDate),
    },
    {
      key: "unprocessed_stripe_events",
      label: "Eventos Stripe não processados",
      severity: severityByCount(staleWebhookEvents.length),
      count: staleWebhookEvents.length,
      description: "Eventos não processados indicam falha de webhook ou erro de atualização local.",
      action: "Auditar logs do webhook e reprocessar eventos críticos antes da migração.",
      samples: sample(staleWebhookEvents),
    },
    {
      key: "missing_recent_stripe_events",
      label: "Tipos de webhook sem evento recente",
      severity: severityByCount(missingRecentStripeEvents.length, "warning"),
      count: missingRecentStripeEvents.length,
      description: "A ausência de tipos críticos pode indicar webhook incompleto ou testes insuficientes.",
      action: "Executar testes Stripe para cada evento esperado.",
      samples: sample(missingRecentStripeEvents),
    },
  ];

  const criticalCount = checks.filter((check) => check.severity === "critical").length;
  const warningCount = checks.filter((check) => check.severity === "warning").length;
  const isReady = criticalCount === 0;

  return {
    isReady,
    criticalCount,
    warningCount,
    totals: {
      authUsers: authUsers.length,
      profiles: profiles.length,
      subscriptions: subscriptions.length,
      paidSubscriptions: paidSubscriptions.length,
      recentStripeEvents: billingEvents.length,
    },
    recentStripeEventTypes,
    checks,
  };
}
