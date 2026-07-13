import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

type AutomationRow = {
  id: string;
  name: string;
  trigger_event: string;
  intent: string;
  priority: number;
  score_weight: number;
  score_threshold: number;
  lookback_hours: number;
  cooldown_hours: number;
  channel: "whatsapp" | "email";
  status: string;
  message_template: string;
  cta_url?: string | null;
  audience_rule?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type MarketingEventRow = {
  id: string;
  user_id: string | null;
  event_key: string | null;
  event_type?: string | null;
  event_label?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp_opt_in?: boolean | null;
  email_opt_in?: boolean | null;
};

type SubscriptionRow = {
  user_id: string;
  status?: string | null;
  plans?: { slug?: string | null } | null;
};

type UserMarketingStateRow = {
  user_id: string;
  last_whatsapp_sent_at?: string | null;
  last_email_sent_at?: string | null;
  cooldown_until?: string | null;
  suppressed_until?: string | null;
};

type Candidate = {
  automation: AutomationRow;
  matchingEvents: MarketingEventRow[];
  latestEvent: MarketingEventRow;
  score: number;
};

type ProcessResult = {
  scannedAutomations: number;
  scannedEvents: number;
  queued: number;
  skipped: number;
  failed: number;
  details: Array<{
    user_id: string;
    automation_id: string;
    status: "queued" | "skipped" | "failed";
    score: number;
    reason?: string;
  }>;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const GLOBAL_DAILY_MARKETING_LIMIT = 3;
const TRANSACTIONAL_PREFIXES = ["subscription.", "upgrade.", "downgrade.", "plan."];
const CHECKOUT_COMPLETION_EVENTS = new Set([
  "checkout_completed",
  "checkout.completed",
  "checkout.session.completed",
  "subscription_created",
  "subscription.created",
  "subscription.trial_started",
  "subscription.first_payment",
  "subscription.renewed",
  "invoice.paid",
  "payment_succeeded",
  "payment.approved",
  "payment_confirmed",
  "payment_received",
  "plan.plus_activated",
  "plan.premium_activated",
  "plan.ministry_activated",
  "upgrade.free_to_plus",
  "upgrade.free_to_premium",
  "upgrade.plus_to_premium",
]);
const PAYMENT_RECOVERY_EVENTS = new Set([
  "subscription.payment_recovered",
  "subscription.first_payment",
  "subscription.renewed",
  "payment.approved",
  "payment_confirmed",
  "payment_received",
  "invoice.paid",
]);
const DEFAULT_PUBLIC_SITE_URL = "https://harmomus.com";

function nowIso() {
  return new Date().toISOString();
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function addHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function cleanName(value?: string | null) {
  const name = String(value ?? "").trim();
  return name && !name.includes("@") ? name : "Aluno";
}

function publicSiteUrl() {
  return String(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || DEFAULT_PUBLIC_SITE_URL).replace(/\/+$/, "");
}

function absoluteUrl(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/")) return `${publicSiteUrl()}${text}`;
  return text;
}

function getEventKey(event: MarketingEventRow) {
  return normalize(event.event_key ?? event.event_type ?? event.event_label);
}

function planSlug(subscription?: SubscriptionRow | null) {
  return normalize(subscription?.plans?.slug) || "free";
}

function isActiveSubscription(subscription?: SubscriptionRow | null) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(normalize(subscription?.status));
}

function selectedPlans(rule?: Record<string, unknown> | null) {
  const plans = rule?.plans;
  return Array.isArray(plans) ? plans.map(normalize).filter(Boolean) : [];
}

function isTransactional(automation: AutomationRow) {
  if (automation.metadata?.transactional === true) return true;
  if (automation.metadata?.category === "billing" || automation.metadata?.category === "subscription" || automation.metadata?.category === "plan_change") return true;
  const event = normalize(automation.trigger_event);
  return TRANSACTIONAL_PREFIXES.some((prefix) => event.startsWith(prefix));
}

function bypassCooldown(automation: AutomationRow) {
  return isTransactional(automation) || automation.metadata?.bypass_global_cooldown === true;
}

function bypassDailyLimit(automation: AutomationRow) {
  return isTransactional(automation) || automation.metadata?.bypass_daily_limit === true;
}

function renderTemplate(template: string, input: { profile: ProfileRow; automation: AutomationRow; event?: MarketingEventRow | null; subscription?: SubscriptionRow | null }) {
  const link = absoluteUrl(input.automation.cta_url);
  const metadata = input.event?.metadata ?? {};
  const amountCents = Number(metadata.amount_paid_cents ?? metadata.amount_due_cents ?? 0);
  const amount = amountCents > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: String(metadata.currency ?? "BRL").toUpperCase() }).format(amountCents / 100) : "";
  const nextBillingRaw = metadata.next_billing_at ?? metadata.period_end ?? metadata.current_period_end;
  const nextBilling = nextBillingRaw ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(String(nextBillingRaw))) : "";
  const rendered = template
    .replace(/{{\s*nome\s*}}/gi, cleanName(input.profile.full_name))
    .replace(/{{\s*email\s*}}/gi, input.profile.email ?? "")
    .replace(/{{\s*link\s*}}/gi, link)
    .replace(/{{\s*campanha\s*}}/gi, input.automation.name ?? "")
    .replace(/{{\s*plano\s*}}/gi, planSlug(input.subscription))
    .replace(/{{\s*valor\s*}}/gi, amount)
    .replace(/{{\s*proxima_cobranca\s*}}/gi, nextBilling);
  const base = publicSiteUrl();
  return rendered.replace(/(^|\s)(\/(?:assinar|checkout|conta|planos|upgrade)(?:\?[^\s]*)?)/gi, (_match, prefix: string, path: string) => `${prefix}${base}${path}`);
}

function hasEventAfter(events: MarketingEventRow[], since: string, keys: Set<string>) {
  const sinceMs = new Date(since).getTime();
  return events.some((event) => new Date(event.created_at).getTime() >= sinceMs && keys.has(getEventKey(event)));
}

function delayMinutesForAutomation(automation: AutomationRow) {
  const metadataDelay = Number(automation.metadata?.recommended_delay_minutes ?? automation.metadata?.delay_minutes);
  if (Number.isFinite(metadataDelay) && metadataDelay >= 0) return Math.floor(metadataDelay);
  if (["checkout_abandoned", "payment_recovery"].includes(automation.intent)) return 120;
  return 0;
}

function scheduledAtForAutomation(automation: AutomationRow) {
  const delay = delayMinutesForAutomation(automation);
  return delay > 0 ? addMinutes(delay) : null;
}

function shouldCancelIfCompleted(automation: AutomationRow) {
  return automation.intent === "checkout_abandoned" || automation.intent === "payment_recovery";
}

function shouldSkipByRule(input: { automation: AutomationRow; events: MarketingEventRow[]; subscription?: SubscriptionRow | null }) {
  const rule = input.automation.audience_rule ?? {};
  const currentPlan = planSlug(input.subscription);
  const plans = selectedPlans(rule);
  if (plans.length && !plans.includes(currentPlan)) return `plan_not_allowed:${currentPlan}`;

  if (input.automation.intent === "checkout_abandoned") {
    const latest = input.events
      .filter((event) => ["checkout_abandoned", "checkout_abandoned_candidate", "checkout_started"].includes(getEventKey(event)))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!latest) return "checkout_abandonment_event_not_found";
    if (hasEventAfter(input.events, latest.created_at, CHECKOUT_COMPLETION_EVENTS)) return "checkout_completed_after_abandonment";
  }

  if (input.automation.intent === "payment_recovery") {
    const latest = input.events
      .filter((event) => ["payment_failed", "subscription.payment_failed"].includes(getEventKey(event)))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!latest) return "payment_failure_event_not_found";
    if (hasEventAfter(input.events, latest.created_at, PAYMENT_RECOVERY_EVENTS)) return "payment_recovered_after_failure";
  }

  if (input.automation.intent === "upgrade_premium") {
    const minBlocks = Number(rule.min_blocks ?? 0);
    const blocks = input.events.filter((event) => getEventKey(event) === "premium_blocked").length;
    if (minBlocks > 0 && blocks < minBlocks) return `min_blocks_not_reached:${blocks}/${minBlocks}`;
  }

  if (["plus", "premium", "ministry", "ministry_10", "ministry_20", "ministry_40"].includes(currentPlan) && isActiveSubscription(input.subscription) && input.automation.intent === "free_active_upgrade") {
    return `already_paid_plan:${currentPlan}`;
  }
  return null;
}

function isInCooldown(state: UserMarketingStateRow | null | undefined, automation: AutomationRow) {
  if (bypassCooldown(automation)) return null;
  const now = Date.now();
  if (state?.suppressed_until && Date.parse(state.suppressed_until) > now) return "suppressed_until_active";
  if (state?.cooldown_until && Date.parse(state.cooldown_until) > now) return "cooldown_active";
  const last = automation.channel === "email" ? state?.last_email_sent_at : state?.last_whatsapp_sent_at;
  const minimumHours = automation.channel === "email" ? 24 : 72;
  if (last && Date.parse(last) > now - minimumHours * 60 * 60 * 1000) return `${automation.channel}_cooldown_active`;
  return null;
}

async function getOrCreateAutomationCampaign(admin: SupabaseAdmin & any, automation: AutomationRow) {
  const name = `[AUTO] ${automation.name}`;
  const { data: existing } = await admin.from("communication_campaigns").select("id").eq("name", name).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await admin.from("communication_campaigns").insert({
    name,
    status: "queued",
    channel: automation.channel,
    audience_type: `automation:${automation.intent}`,
    subject: automation.name,
    preview_text: automation.message_template.slice(0, 180),
    text_content: automation.message_template,
    content: { automation_id: automation.id, automation_intent: automation.intent, transactional: isTransactional(automation) },
    updated_at: nowIso(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function hasProcessedEvent(admin: SupabaseAdmin & any, automationId: string, eventId: string) {
  const { data } = await admin.from("marketing_automation_runs")
    .select("id")
    .eq("automation_id", automationId)
    .eq("trigger_event_id", eventId)
    .in("status", ["queued", "skipped"])
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function hasRecentOrPendingAutomationJob(admin: SupabaseAdmin & any, automation: AutomationRow, userId: string) {
  const since = hoursAgo(Math.max(24, automation.cooldown_hours || 24));
  const { data } = await admin.from("communication_queue")
    .select("id")
    .eq("user_id", userId)
    .eq("channel", automation.channel)
    .eq("payload->>automation_id", automation.id)
    .in("status", ["pending", "processing", "queued", "sent"])
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function reachedDailyMarketingLimit(admin: SupabaseAdmin & any, userId: string, channel: "whatsapp" | "email") {
  const { count } = await admin.from("communication_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("payload->>transactional", "false")
    .in("status", ["pending", "processing", "queued", "sent"])
    .gte("created_at", startOfTodayIso());
  return Number(count ?? 0) >= GLOBAL_DAILY_MARKETING_LIMIT;
}

async function markRun(admin: SupabaseAdmin & any, input: { automation: AutomationRow; userId: string; event: MarketingEventRow; score: number; status: "queued" | "skipped" | "failed"; reason?: string; campaignId?: string | null; queueId?: string | null; scheduledAt?: string | null }) {
  await admin.from("marketing_automation_runs").insert({
    automation_id: input.automation.id,
    campaign_id: input.campaignId ?? null,
    queue_id: input.queueId ?? null,
    user_id: input.userId,
    trigger_event_id: input.event.id,
    trigger_event_key: getEventKey(input.event),
    intent: input.automation.intent,
    channel: input.automation.channel,
    score: input.score,
    status: input.status,
    skipped_reason: input.status === "skipped" ? input.reason ?? null : null,
    error_message: input.status === "failed" ? input.reason ?? null : null,
    scheduled_at: input.scheduledAt ?? null,
    processed_at: nowIso(),
    payload: { automation_name: input.automation.name, transactional: isTransactional(input.automation), reason: input.reason ?? null },
  });
}

async function enqueue(admin: SupabaseAdmin & any, input: { automation: AutomationRow; campaignId: string; profile: ProfileRow; subscription?: SubscriptionRow | null; event: MarketingEventRow; score: number; scheduledAt?: string | null }) {
  const phone = normalizePhone(input.profile.phone);
  if (input.automation.channel === "whatsapp" && phone.length < 10) return { queueId: null, reason: "missing_phone" };
  if (input.automation.channel === "email" && !input.profile.email) return { queueId: null, reason: "missing_email" };
  if (input.automation.channel === "whatsapp" && input.profile.whatsapp_opt_in === false) return { queueId: null, reason: "whatsapp_opt_out" };
  if (input.automation.channel === "email" && input.profile.email_opt_in === false) return { queueId: null, reason: "email_opt_out" };
  if (!bypassDailyLimit(input.automation) && await reachedDailyMarketingLimit(admin, input.profile.id, input.automation.channel)) return { queueId: null, reason: "daily_marketing_limit_reached" };
  if (await hasRecentOrPendingAutomationJob(admin, input.automation, input.profile.id)) return { queueId: null, reason: "duplicate_recent_or_pending_job" };

  const message = renderTemplate(input.automation.message_template, { profile: input.profile, automation: input.automation, event: input.event, subscription: input.subscription });
  const ctaUrl = absoluteUrl(input.automation.cta_url);
  const transactional = isTransactional(input.automation);
  const { data, error } = await admin.from("communication_queue").insert({
    campaign_id: input.campaignId,
    user_id: input.profile.id,
    recipient_name: cleanName(input.profile.full_name),
    recipient_email: input.profile.email ?? null,
    recipient_phone: phone || null,
    channel: input.automation.channel,
    status: "pending",
    scheduled_at: input.scheduledAt ?? null,
    payload: {
      message,
      normalized_phone: phone || null,
      automation_id: input.automation.id,
      automation_intent: input.automation.intent,
      score: input.score,
      cta_url: ctaUrl || null,
      link: ctaUrl || null,
      link_url: ctaUrl || null,
      trigger_event_id: input.event.id,
      trigger_event_key: getEventKey(input.event),
      trigger_event_at: input.event.created_at,
      cancel_if_conversion: shouldCancelIfCompleted(input.automation),
      transactional,
    },
  }).select("id").single();
  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("duplicate") || error.code === "23505") return { queueId: null, reason: "duplicate_queue_constraint" };
    throw new Error(error.message);
  }
  return { queueId: data.id as string, reason: null };
}

async function updateUserState(admin: SupabaseAdmin & any, input: { userId: string; automation: AutomationRow; event: MarketingEventRow; campaignId?: string | null }) {
  const transactional = isTransactional(input.automation);
  await admin.from("user_marketing_state").upsert({
    user_id: input.userId,
    dominant_intent: input.automation.intent,
    dominant_automation_id: input.automation.id,
    last_event_key: getEventKey(input.event),
    last_event_at: input.event.created_at,
    last_campaign_id: input.campaignId ?? null,
    last_automation_id: input.automation.id,
    last_campaign_type: input.automation.intent,
    last_campaign_sent_at: nowIso(),
    ...(input.automation.channel === "email" ? { last_email_sent_at: nowIso() } : { last_whatsapp_sent_at: nowIso() }),
    ...(transactional ? { cooldown_until: null } : { cooldown_until: addHours(input.automation.cooldown_hours) }),
    updated_at: nowIso(),
  }, { onConflict: "user_id" });
}

export async function processBehaviorMarketingAutomations(options: { dryRun?: boolean; limit?: number } = {}): Promise<ProcessResult> {
  const admin = createSupabaseAdminClient() as SupabaseAdmin & any;
  const result: ProcessResult = { scannedAutomations: 0, scannedEvents: 0, queued: 0, skipped: 0, failed: 0, details: [] };

  const { data: automations, error: automationsError } = await admin.from("marketing_automations").select("*").eq("status", "active").order("priority", { ascending: true }).limit(100);
  if (automationsError) throw new Error(automationsError.message);
  const activeAutomations = (automations ?? []) as AutomationRow[];
  result.scannedAutomations = activeAutomations.length;
  if (!activeAutomations.length) return result;

  const maxLookback = Math.max(...activeAutomations.map((automation) => Number(automation.lookback_hours || 168)));
  const eventKeys = Array.from(new Set(activeAutomations.map((automation) => automation.trigger_event));
  const { data: events, error: eventsError } = await admin.from("marketing_events")
    .select("id,user_id,event_key,event_type,event_label,metadata,created_at")
    .not("user_id", "is", null)
    .in("event_key", eventKeys)
    .gte("created_at", hoursAgo(maxLookback))
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 2000);
  if (eventsError) throw new Error(eventsError.message);
  const eventRows = (events ?? []) as MarketingEventRow[];
  result.scannedEvents = eventRows.length;
  if (!eventRows.length) return result;

  const eventsByUser = new Map<string, MarketingEventRow[]>();
  for (const event of eventRows) {
    if (!event.user_id) continue;
    eventsByUser.set(event.user_id, [...(eventsByUser.get(event.user_id) ?? []), event]);
  }
  const userIds = [...eventsByUser.keys()];
  const [{ data: profiles }, { data: subscriptions }, { data: states }] = await Promise.all([
    admin.from("profiles").select("id,full_name,email,phone,whatsapp_opt_in,email_opt_in").in("id", userIds),
    admin.from("subscriptions").select("user_id,status,plans(slug)").in("user_id", userIds).order("updated_at", { ascending: false }),
    admin.from("user_marketing_state").select("*").in("user_id", userIds),
  ]);
  const profileById = new Map<string, ProfileRow>((profiles ?? []).map((row: ProfileRow) => [row.id, row]));
  const stateByUser = new Map<string, UserMarketingStateRow>((states ?? []).map((row: UserMarketingStateRow) => [row.user_id, row]));
  const subscriptionByUser = new Map<string, SubscriptionRow>();
  for (const row of (subscriptions ?? []) as SubscriptionRow[]) if (!subscriptionByUser.has(row.user_id)) subscriptionByUser.set(row.user_id, row);

  for (const userId of userIds) {
    const profile = profileById.get(userId);
    if (!profile) continue;
    const userEvents = eventsByUser.get(userId) ?? [];
    const subscription = subscriptionByUser.get(userId);
    const state = stateByUser.get(userId);
    const candidates: Candidate[] = [];

    for (const automation of activeAutomations) {
      const cutoff = Date.now() - Number(automation.lookback_hours || 168) * 60 * 60 * 1000;
      const matching = userEvents.filter((event) => getEventKey(event) === normalize(automation.trigger_event) && Date.parse(event.created_at) >= cutoff);
      const unprocessed: MarketingEventRow[] = [];
      for (const event of matching) if (!(await hasProcessedEvent(admin, automation.id, event.id))) unprocessed.push(event);
      if (!unprocessed.length) continue;
      unprocessed.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      const score = unprocessed.length * Number(automation.score_weight || 1);
      if (score >= Number(automation.score_threshold || 1)) candidates.push({ automation, matchingEvents: unprocessed, latestEvent: unprocessed[0], score });
    }

    candidates.sort((a, b) => a.automation.priority - b.automation.priority || Date.parse(b.latestEvent.created_at) - Date.parse(a.latestEvent.created_at) || b.score - a.score);
    if (!candidates.length) continue;
    const winner = candidates[0];

    for (const loser of candidates.slice(1)) {
      const reason = `suppressed_by_priority:${winner.automation.trigger_event}`;
      await markRun(admin, { automation: loser.automation, userId, event: loser.latestEvent, score: loser.score, status: "skipped", reason });
      result.skipped += 1;
      result.details.push({ user_id: userId, automation_id: loser.automation.id, status: "skipped", score: loser.score, reason });
    }

    const ruleSkip = shouldSkipByRule({ automation: winner.automation, events: userEvents, subscription });
    const cooldownSkip = isInCooldown(state, winner.automation);
    const skipReason = ruleSkip ?? cooldownSkip;
    if (skipReason) {
      await markRun(admin, { automation: winner.automation, userId, event: winner.latestEvent, score: winner.score, status: "skipped", reason: skipReason });
      result.skipped += 1;
      result.details.push({ user_id: userId, automation_id: winner.automation.id, status: "skipped", score: winner.score, reason: skipReason });
      continue;
    }
    if (options.dryRun) {
      result.skipped += 1;
      result.details.push({ user_id: userId, automation_id: winner.automation.id, status: "skipped", score: winner.score, reason: "dry_run" });
      continue;
    }

    try {
      const campaignId = await getOrCreateAutomationCampaign(admin, winner.automation);
      const scheduledAt = scheduledAtForAutomation(winner.automation);
      const queued = await enqueue(admin, { automation: winner.automation, campaignId, profile, subscription, event: winner.latestEvent, score: winner.score, scheduledAt });
      if (queued.reason) {
        await markRun(admin, { automation: winner.automation, userId, event: winner.latestEvent, score: winner.score, status: "skipped", reason: queued.reason });
        result.skipped += 1;
        result.details.push({ user_id: userId, automation_id: winner.automation.id, status: "skipped", score: winner.score, reason: queued.reason });
        continue;
      }
      await markRun(admin, { automation: winner.automation, userId, event: winner.latestEvent, score: winner.score, status: "queued", campaignId, queueId: queued.queueId, scheduledAt });
      await updateUserState(admin, { userId, automation: winner.automation, event: winner.latestEvent, campaignId });
      result.queued += 1;
      result.details.push({ user_id: userId, automation_id: winner.automation.id, status: "queued", score: winner.score });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      await markRun(admin, { automation: winner.automation, userId, event: winner.latestEvent, score: winner.score, status: "failed", reason: message });
      result.failed += 1;
      result.details.push({ user_id: userId, automation_id: winner.automation.id, status: "failed", score: winner.score, reason: message });
    }
  }

  return result;
}
