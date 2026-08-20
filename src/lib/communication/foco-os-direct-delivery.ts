import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getFocoOsCommunicationToken } from "@/lib/communication/foco-os-token";

const HUB_ENDPOINT = "https://escola.focoemcanto.com/api/webhooks/harmomus/communication";

type Automation = {
  id: string;
  name: string;
  trigger_event: string;
  intent: string;
  channel: "whatsapp" | "email";
  message_template: string | null;
  cta_url?: string | null;
  priority?: number | null;
};

type EventRow = {
  id: string;
  user_id: string;
  event_key: string;
  event_label?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type SubscriptionState = {
  user_id: string;
  status?: string | null;
  plan_id?: string | null;
  updated_at?: string | null;
  plans?: { slug?: string | null } | Array<{ slug?: string | null }> | null;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function cleanName(value: unknown) {
  const text = String(value ?? "").trim();
  return text && !text.includes("@") ? text : "Aluno";
}

function absoluteUrl(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return text.startsWith("/") ? `https://harmomus.com${text}` : text;
}

function planFamily(value: unknown) {
  const slug = normalize(value);
  if (!slug) return "";
  if (slug.startsWith("ministry")) return "ministry";
  if (slug === "premium") return "premium";
  if (slug === "plus") return "plus";
  if (slug === "free") return "free";
  return slug;
}

function subscriptionPlanSlug(subscription?: SubscriptionState | null) {
  if (!subscription?.plans) return "";
  if (Array.isArray(subscription.plans)) return String(subscription.plans[0]?.slug ?? "");
  return String(subscription.plans.slug ?? "");
}

function metadataPlan(metadata: Record<string, unknown>) {
  return String(
    metadata.plan_slug ??
    metadata.plan ??
    metadata.to_plan_slug ??
    metadata.target_plan_slug ??
    "",
  );
}

function metadataPreviousPlan(metadata: Record<string, unknown>) {
  return String(metadata.previous_plan_slug ?? metadata.from_plan_slug ?? "");
}

function isPaidPlan(value: unknown) {
  return ["plus", "premium", "ministry"].includes(planFamily(value));
}

function positiveAmount(metadata: Record<string, unknown>) {
  const raw = metadata.amount_due_cents ?? metadata.amount_paid_cents;
  if (raw === undefined || raw === null || raw === "") return true;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0;
}

function expectedPlanFromEvent(eventKey: string) {
  const key = normalize(eventKey);
  if (key.includes("premium")) return "premium";
  if (key.includes("plus")) return "plus";
  if (key.includes("ministry")) return "ministry";
  if (key.includes("free")) return "free";
  return "";
}

function eligibilityForFocoOs(event: EventRow, subscription?: SubscriptionState | null) {
  const key = normalize(event.event_key);
  const metadata = event.metadata ?? {};
  const eventPlan = metadataPlan(metadata);
  const previousPlan = metadataPreviousPlan(metadata);
  const currentPlan = subscriptionPlanSlug(subscription);
  const bestPlan = eventPlan || currentPlan || previousPlan;
  const currentStatus = normalize(subscription?.status);

  // Cadastro gratuito é exclusivamente onboarding Free. Se o usuário já virou pago
  // antes da sincronização, a ativação do plano pago é a comunicação relevante.
  if (key === "subscription.free.created" || key === "plan.free_activated") {
    const family = planFamily(bestPlan);
    if (family && family !== "free") return { ok: false, reason: `free_event_for_${family}` };
    return { ok: true };
  }

  // Eventos financeiros só fazem sentido para uma assinatura paga real.
  if ([
    "subscription.payment_failed",
    "subscription.first_payment",
    "subscription.renewed",
    "subscription.payment_recovered",
    "subscription.trial_started",
  ].includes(key)) {
    if (!isPaidPlan(bestPlan)) return { ok: false, reason: "financial_event_without_paid_plan" };
    if (!positiveAmount(metadata) && key !== "subscription.trial_started") {
      return { ok: false, reason: "financial_event_without_positive_amount" };
    }
    if (key === "subscription.payment_failed" && ["active", "trialing"].includes(currentStatus) && !metadata.amount_due_cents) {
      return { ok: false, reason: "payment_failure_not_confirmed_by_subscription_state" };
    }
    return { ok: true };
  }

  // Cancelamento precisa se referir a um plano pago. Uma conta Free não recebe
  // mensagem de cancelamento de assinatura.
  if (key === "subscription.canceled" || key === "subscription.cancelled") {
    if (!isPaidPlan(eventPlan || previousPlan || currentPlan)) {
      return { ok: false, reason: "cancellation_without_paid_plan" };
    }
    return { ok: true };
  }

  // Ativação de plano deve combinar com o plano realmente ativado.
  if (/^plan\.(plus|premium|ministry)_activated$/.test(key)) {
    const expected = expectedPlanFromEvent(key);
    const actual = planFamily(eventPlan || currentPlan);
    if (actual && actual !== expected) return { ok: false, reason: `plan_activation_mismatch:${expected}:${actual}` };
    if (!actual) return { ok: false, reason: "plan_activation_without_plan" };
    return { ok: true };
  }

  // Upgrade/downgrade é validado pelo destino quando disponível.
  if (/^(upgrade|downgrade)\./.test(key)) {
    const expected = expectedPlanFromEvent(key.split("_to_")[1] ?? "");
    const actual = planFamily(eventPlan || currentPlan);
    if (expected && actual && expected !== actual) {
      return { ok: false, reason: `plan_transition_mismatch:${expected}:${actual}` };
    }
    return { ok: true };
  }

  // Abandono é diferente: o usuário pode continuar Free porque justamente abandonou
  // o upgrade. Por isso usamos o plano pretendido no checkout, não o plano atual.
  if (key === "checkout.abandoned" || /^checkout\.(plus|premium)\.abandoned$/.test(key)) {
    const intended = planFamily(eventPlan || expectedPlanFromEvent(key));
    if (!["plus", "premium"].includes(intended)) {
      return { ok: false, reason: "checkout_abandoned_without_paid_target" };
    }
    return { ok: true };
  }

  return { ok: true };
}

function render(template: string | null | undefined, automation: Automation, event: EventRow, profile: Profile) {
  const metadata = event.metadata ?? {};
  const link = absoluteUrl(automation.cta_url);
  const plan = String(metadata.plan ?? metadata.plan_slug ?? "");
  const amountCents = Number(metadata.amount_paid_cents ?? metadata.amount_due_cents ?? 0);
  const amount = amountCents > 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountCents / 100)
    : "";
  const base = String(template || `Oii, {{nome}}! 😊 Aqui é o Marcos. Estou entrando em contato sobre o Harmomus.`);
  return base
    .replace(/{{\s*nome\s*}}/gi, cleanName(profile.full_name ?? metadata.full_name ?? metadata.name))
    .replace(/{{\s*email\s*}}/gi, String(profile.email ?? metadata.email ?? ""))
    .replace(/{{\s*link\s*}}/gi, link)
    .replace(/{{\s*plano\s*}}/gi, plan)
    .replace(/{{\s*valor\s*}}/gi, amount);
}

export async function deliverFocoOsCards(limit = 20) {
  const admin = createSupabaseAdminClient() as any;
  const token = await getFocoOsCommunicationToken();
  if (!token) throw new Error("provider_not_configured");

  const result = {
    scannedAutomations: 0,
    scannedEvents: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
    delivered: 0,
    convertedLegacy: 0,
    details: [] as Array<Record<string, unknown>>,
  };

  const { data: automations, error: automationsError } = await admin
    .from("marketing_automations")
    .select("id,name,trigger_event,intent,channel,message_template,cta_url,priority")
    .eq("status", "active")
    .eq("channel", "whatsapp")
    .order("priority", { ascending: true })
    .limit(100);
  if (automationsError) throw new Error(`automations:${automationsError.message}`);

  const active = (automations ?? []) as Automation[];
  result.scannedAutomations = active.length;
  if (!active.length) return result;

  const byTrigger = new Map(active.map((automation) => [normalize(automation.trigger_event), automation]));
  const triggers = [...byTrigger.keys()];

  const { data: events, error: eventsError } = await admin
    .from("marketing_events")
    .select("id,user_id,event_key,event_label,metadata,created_at")
    .not("user_id", "is", null)
    .in("event_key", triggers)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 20, 50)));
  if (eventsError) throw new Error(`events:${eventsError.message}`);

  const rows = (events ?? []) as EventRow[];
  result.scannedEvents = rows.length;
  if (!rows.length) return result;

  const latest = new Map<string, { event: EventRow; automation: Automation }>();
  for (const event of rows) {
    const automation = byTrigger.get(normalize(event.event_key));
    if (!automation || !event.user_id) continue;
    const key = `${automation.id}:${event.user_id}`;
    if (!latest.has(key)) latest.set(key, { event, automation });
  }

  const userIds = [...new Set([...latest.values()].map(({ event }) => event.user_id))];
  const [{ data: profiles, error: profilesError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    admin.from("profiles").select("id,full_name,email,phone").in("id", userIds),
    admin
      .from("subscriptions")
      .select("user_id,status,plan_id,updated_at,plans(slug)")
      .in("user_id", userIds)
      .order("updated_at", { ascending: false }),
  ]);
  if (profilesError) console.warn("[foco-os-direct-delivery] profiles lookup failed", profilesError.message);
  if (subscriptionsError) console.warn("[foco-os-direct-delivery] subscriptions lookup failed", subscriptionsError.message);

  const profileMap = new Map<string, Profile>((profiles ?? []).map((row: Profile) => [row.id, row]));
  const subscriptionMap = new Map<string, SubscriptionState>();
  for (const row of (subscriptions ?? []) as SubscriptionState[]) {
    if (row.user_id && !subscriptionMap.has(row.user_id)) subscriptionMap.set(row.user_id, row);
  }

  const candidates = [...latest.values()];
  const outcomes = await Promise.all(candidates.map(async ({ event, automation }) => {
    const metadata = event.metadata ?? {};
    const eligibility = eligibilityForFocoOs(event, subscriptionMap.get(event.user_id));
    if (!eligibility.ok) {
      return {
        kind: "skipped" as const,
        detail: {
          user_id: event.user_id,
          event_id: event.id,
          event_key: event.event_key,
          reason: eligibility.reason,
        },
      };
    }

    const profile = profileMap.get(event.user_id) ?? {
      id: event.user_id,
      full_name: String(metadata.full_name ?? metadata.name ?? "Aluno"),
      email: String(metadata.email ?? "") || null,
      phone: String(metadata.phone ?? metadata.whatsapp ?? "") || null,
    };
    const recipientPhone = digits(profile.phone ?? metadata.phone ?? metadata.whatsapp);
    if (recipientPhone.length < 10) {
      return { kind: "skipped" as const, detail: { user_id: event.user_id, event_id: event.id, reason: "missing_phone" } };
    }

    const message = render(automation.message_template, automation, event, profile);
    const link = absoluteUrl(automation.cta_url);
    const jobId = `harmomus:${automation.id}:${event.id}`;
    const payload = {
      job_id: jobId,
      id: jobId,
      source: "harmomus.direct_foco_os",
      user_id: event.user_id,
      recipient_name: cleanName(profile.full_name),
      recipient_email: profile.email ?? (String(metadata.email ?? "") || null),
      phone: recipientPhone,
      number: recipientPhone,
      whatsapp: recipientPhone,
      recipient: recipientPhone,
      message,
      text: message,
      mensagem: message,
      automation_id: automation.id,
      automation_intent: automation.intent,
      trigger_event_id: event.id,
      trigger_event_key: event.event_key,
      trigger_event_at: event.created_at,
      source_product: "harmomus",
      link,
      link_url: link,
      plan: String(metadata.plan ?? metadata.plan_slug ?? subscriptionPlanSlug(subscriptionMap.get(event.user_id)) ?? ""),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(HUB_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      const raw = await response.text();
      let body: any = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      if (!response.ok || body?.success !== true) {
        const reason = `hub:${response.status}:${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 500)}`;
        return { kind: "failed" as const, detail: { user_id: event.user_id, event_id: event.id, reason } };
      }
      return { kind: "delivered" as const, detail: { user_id: event.user_id, event_id: event.id, provider_message_id: body.providerMessageId ?? body.id ?? null, duplicate: body.duplicate === true } };
    } catch (error) {
      return { kind: "failed" as const, detail: { user_id: event.user_id, event_id: event.id, reason: error instanceof Error ? error.message : "hub_fetch_failed" } };
    }
  }));

  for (const outcome of outcomes) {
    if (outcome.kind === "delivered") {
      result.queued += 1;
      result.delivered += 1;
      result.details.push({ ...outcome.detail, status: "queued", mode: "direct_hub" });
    } else if (outcome.kind === "skipped") {
      result.skipped += 1;
      result.details.push({ ...outcome.detail, status: "skipped" });
    } else {
      result.failed += 1;
      result.details.push({ ...outcome.detail, status: "failed" });
    }
  }

  const failureReasons = result.details
    .filter((detail) => detail.status === "failed")
    .reduce<Record<string, number>>((acc, detail) => {
      const reason = String(detail.reason ?? "unknown");
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {});
  if (Object.keys(failureReasons).length) console.warn("[foco-os-direct-delivery] failures", failureReasons);

  return result;
}
