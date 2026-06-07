import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

type AutomationRow = {
  id: string;
  name: string;
  description?: string | null;
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
  current_score?: number | null;
  dominant_intent?: string | null;
  dominant_automation_id?: string | null;
  last_campaign_sent_at?: string | null;
  last_whatsapp_sent_at?: string | null;
  last_email_sent_at?: string | null;
  cooldown_until?: string | null;
  suppressed_until?: string | null;
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
const BLOCKING_COMPLETION_EVENTS = new Set([
  "checkout_completed",
  "checkout.completed",
  "checkout.session.completed",
  "subscription_created",
  "subscription.created",
  "invoice.paid",
  "payment_succeeded",
  "plan.plus_activated",
  "plan.premium_activated",
]);

const DEFAULT_PUBLIC_SITE_URL = "https://harmomus.com";
const GLOBAL_DAILY_AUTOMATION_LIMIT = 3;

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

function normalizeRelativeLinksInMessage(message: string) {
  const base = publicSiteUrl();
  return message.replace(/(^|\s)(\/(?:assinar|checkout|conta|planos|upgrade)(?:\?[^\s]*)?)/gi, (_match, prefix: string, path: string) => {
    return `${prefix}${base}${path}`;
  });
}

function renderTemplate(template: string, input: { profile: ProfileRow; automation: AutomationRow }) {
  const link = absoluteUrl(input.automation.cta_url);
  const rendered = template
    .replace(/{{\s*nome\s*}}/gi, cleanName(input.profile.full_name))
    .replace(/{{\s*email\s*}}/gi, input.profile.email ?? "")
    .replace(/{{\s*link\s*}}/gi, link)
    .replace(/{{\s*campanha\s*}}/gi, input.automation.name ?? "");

  return normalizeRelativeLinksInMessage(rendered);
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
  if (!Array.isArray(plans)) return [];
  return plans.map((plan) => normalize(plan)).filter(Boolean);
}

function hasCompletionAfter(events: MarketingEventRow[], since: string) {
  const sinceMs = new Date(since).getTime();
  return events.some((event) => {
    const eventMs = new Date(event.created_at).getTime();
    return eventMs >= sinceMs && BLOCKING_COMPLETION_EVENTS.has(getEventKey(event));
  });
}

function delayMinutesForAutomation(automation: AutomationRow) {
  const metadataDelay = Number(automation.metadata?.recommended_delay_minutes ?? automation.metadata?.delay_minutes);
  if (Number.isFinite(metadataDelay) && metadataDelay >= 0) return Math.floor(metadataDelay);
  if (automation.intent === "checkout_abandoned") return 120;
  if (automation.intent === "payment_recovery") return 120;
  return 0;
}

function scheduledAtForAutomation(automation: AutomationRow) {
  const delay = delayMinutesForAutomation(automation);
  return delay > 0 ? addMinutes(delay) : null;
}

function shouldCancelIfCompleted(automation: AutomationRow) {
  return automation.intent === "checkout_abandoned" || automation.intent === "payment_recovery";
}

function shouldSkipByRule(input: {
  automation: AutomationRow;
  events: MarketingEventRow[];
  subscription?: SubscriptionRow | null;
}) {
  const rule = input.automation.audience_rule ?? {};
  const plans = selectedPlans(rule);
  const currentPlan = planSlug(input.subscription);

  if (plans.length && !plans.includes(currentPlan)) return `plan_not_allowed:${currentPlan}`;

  if (input.automation.intent === "checkout_abandoned") {
    const latestCheckoutStarted = input.events
      .filter((event) => getEventKey(event) === "checkout_started")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    if (!latestCheckoutStarted) return "checkout_started_not_found";
    if (hasCompletionAfter(input.events, latestCheckoutStarted.created_at)) return "checkout_completed_after_start";
  }

  if (input.automation.intent === "payment_recovery") {
    const latestPaymentFailed = input.events
      .filter((event) => getEventKey(event) === "payment_failed")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    if (latestPaymentFailed && hasCompletionAfter(input.events, latestPaymentFailed.created_at)) return "payment_recovered_after_failure";
  }

  if (input.automation.intent === "upgrade_premium") {
    const minBlocks = Number(rule.min_blocks ?? 0);
    if (minBlocks > 0) {
      const blocks = input.events.filter((event) => getEventKey(event) === "premium_blocked").length;
      if (blocks < minBlocks) return `min_blocks_not_reached:${blocks}/${minBlocks}`;
    }
  }

  if (input.automation.intent === "free_active_upgrade" || input.automation.intent === "plus_to_premium") {
    const minPlays = Number(rule.min_plays ?? 0);
    if (minPlays > 0) {
      const plays = input.events.filter((event) => getEventKey(event) === "audio_played").length;
      if (plays < minPlays) return `min_plays_not_reached:${plays}/${minPlays}`;
    }
  }

  if (["plus", "premium", "ministry", "ministry_10", "ministry_20", "ministry_40"].includes(currentPlan) && isActiveSubscription(input.subscription) && input.automation.intent === "free_active_upgrade") {
    return `already_paid_plan:${currentPlan}`;
  }

  return null;
}

function isInCooldown(state?: UserMarketingStateRow | null, channel?: "whatsapp" | "email") {
  const now = Date.now();
  if (state?.suppressed_until && new Date(state.suppressed_until).getTime() > now) return "suppressed_until_active";
  if (state?.cooldown_until && new Date(state.cooldown_until).getTime() > now) return "cooldown_active";

  const channelLastSentAt = channel === "email" ? state?.last_email_sent_at : state?.last_whatsapp_sent_at;
  if (channelLastSentAt) {
    const minimumHours = channel === "email" ? 24 : 72;
    if (new Date(channelLastSentAt).getTime() > Date.now() - minimumHours * 60 * 60 * 1000) {
      return `${channel}_cooldown_active`;
    }
  }

  return null;
}

async function getOrCreateAutomationCampaign(admin: SupabaseAdmin & any, automation: AutomationRow) {
  const campaignName = `[AUTO] ${automation.name}`;
  const { data: existing, error: existingError } = await admin
    .from("communication_campaigns")
    .select("id")
    .eq("name", campaignName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id as string;

  const content = {
    title: automation.name,
    link_url: absoluteUrl(automation.cta_url),
    channels: [automation.channel],
    schedule_mode: "automation",
    automation_id: automation.id,
    automation_intent: automation.intent,
    audience_filters: automation.audience_rule ?? {},
  };

  const { data, error } = await admin
    .from("communication_campaigns")
    .insert({
      name: campaignName,
      status: "queued",
      channel: automation.channel,
      audience_type: `automation:${automation.intent}`,
      subject: automation.name,
      preview_text: automation.message_template.slice(0, 180),
      text_content: automation.message_template,
      content,
      updated_at: nowIso(),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

async function hasRecentOrPendingAutomationJob(input: {
  admin: SupabaseAdmin & any;
  automation: AutomationRow;
  userId: string;
  sinceHours?: number;
}) {
  const since = hoursAgo(input.sinceHours ?? Math.max(24, input.automation.cooldown_hours || 24));
  const { data, error } = await input.admin
    .from("communication_queue")
    .select("id,status,created_at")
    .eq("user_id", input.userId)
    .eq("channel", input.automation.channel)
    .eq("payload->>automation_id", input.automation.id)
    .in("status", ["pending", "processing", "queued", "sent"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.id);
}

async function reachedDailyAutomationLimit(input: {
  admin: SupabaseAdmin & any;
  userId: string;
  channel: "whatsapp" | "email";
}) {
  const { count, error } = await input.admin
    .from("communication_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("channel", input.channel)
    .not("payload->>automation_id", "is", null)
    .in("status", ["pending", "processing", "queued", "sent"])
    .gte("created_at", startOfTodayIso());

  if (error) return false;
  return Number(count ?? 0) >= GLOBAL_DAILY_AUTOMATION_LIMIT;
}

async function enqueueCommunicationJob(input: {
  admin: SupabaseAdmin & any;
  automation: AutomationRow;
  campaignId: string;
  profile: ProfileRow;
  score: number;
  event?: MarketingEventRow | null;
  scheduledAt?: string | null;
}) {
  const phone = normalizePhone(input.profile.phone);
  const message = renderTemplate(input.automation.message_template, {
    profile: input.profile,
    automation: input.automation,
  });
  const ctaUrl = absoluteUrl(input.automation.cta_url);

  if (input.automation.channel === "whatsapp" && phone.length < 10) {
    return { queueId: null, skippedReason: "missing_phone" };
  }

  if (input.automation.channel === "email" && !input.profile.email) {
    return { queueId: null, skippedReason: "missing_email" };
  }

  if (input.automation.channel === "whatsapp" && input.profile.whatsapp_opt_in === false) {
    return { queueId: null, skippedReason: "whatsapp_opt_out" };
  }

  if (input.automation.channel === "email" && input.profile.email_opt_in === false) {
    return { queueId: null, skippedReason: "email_opt_out" };
  }

  if (await reachedDailyAutomationLimit({ admin: input.admin, userId: input.profile.id, channel: input.automation.channel })) {
    return { queueId: null, skippedReason: "daily_automation_limit_reached" };
  }

  if (await hasRecentOrPendingAutomationJob({ admin: input.admin, automation: input.automation, userId: input.profile.id })) {
    return { queueId: null, skippedReason: "duplicate_recent_or_pending_job" };
  }

  const { data, error } = await input.admin
    .from("communication_queue")
    .insert({
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
        trigger_event_id: input.event?.id ?? null,
        trigger_event_key: input.event ? getEventKey(input.event) : input.automation.trigger_event,
        trigger_event_at: input.event?.created_at ?? null,
        cancel_if_conversion: shouldCancelIfCompleted(input.automation),
      },
    })
    .select("id")
    .single();

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("duplicate") || error.code === "23505") {
      return { queueId: null, skippedReason: "duplicate_queue_constraint" };
    }
    throw new Error(error.message);
  }

  return { queueId: data.id as string, skippedReason: null };
}

async function markSkipped(input: {
  admin: SupabaseAdmin & any;
  automation: AutomationRow;
  userId: string;
  event?: MarketingEventRow | null;
  score: number;
  reason: string;
}) {
  await input.admin.from("marketing_automation_runs").insert({
    automation_id: input.automation.id,
    user_id: input.userId,
    trigger_event_id: input.event?.id ?? null,
    trigger_event_key: input.event ? getEventKey(input.event) : input.automation.trigger_event,
    intent: input.automation.intent,
    channel: input.automation.channel,
    score: input.score,
    status: "skipped",
    skipped_reason: input.reason,
    processed_at: nowIso(),
    payload: { automation_name: input.automation.name },
  });
}

async function upsertUserState(input: {
  admin: SupabaseAdmin & any;
  userId: string;
  automation: AutomationRow;
  score: number;
  event?: MarketingEventRow | null;
  campaignId?: string | null;
  sent?: boolean;
}) {
  const sentPatch = input.sent
    ? {
        last_campaign_id: input.campaignId ?? null,
        last_automation_id: input.automation.id,
        last_campaign_type: input.automation.intent,
        last_campaign_sent_at: nowIso(),
        ...(input.automation.channel === "email" ? { last_email_sent_at: nowIso() } : { last_whatsapp_sent_at: nowIso() }),
        cooldown_until: addHours(input.automation.cooldown_hours),
      }
    : {};

  await input.admin.from("user_marketing_state").upsert(
    {
      user_id: input.userId,
      current_score: input.score,
      dominant_intent: input.automation.intent,
      dominant_automation_id: input.automation.id,
      last_event_key: input.event ? getEventKey(input.event) : input.automation.trigger_event,
      last_event_at: input.event?.created_at ?? nowIso(),
      ...sentPatch,
      updated_at: nowIso(),
    },
    { onConflict: "user_id" },
  );
}

export async function processBehaviorMarketingAutomations(options: { dryRun?: boolean; limit?: number } = {}): Promise<ProcessResult> {
  const admin = createSupabaseAdminClient() as SupabaseAdmin & any;
  const result: ProcessResult = {
    scannedAutomations: 0,
    scannedEvents: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  const { data: automations, error: automationsError } = await admin
    .from("marketing_automations")
    .select("*")
    .eq("status", "active")
    .order("priority", { ascending: true })
    .limit(50);

  if (automationsError) throw new Error(automationsError.message);
  const activeAutomations = (automations ?? []) as AutomationRow[];
  result.scannedAutomations = activeAutomations.length;
  if (!activeAutomations.length) return result;

  const maxLookback = Math.max(...activeAutomations.map((automation) => Number(automation.lookback_hours || 168)));
  const eventKeys = Array.from(new Set(activeAutomations.map((automation) => automation.trigger_event)));

  const { data: events, error: eventsError } = await admin
    .from("marketing_events")
    .select("id,user_id,event_key,event_type,event_label,metadata,created_at")
    .not("user_id", "is", null)
    .in("event_key", eventKeys)
    .gte("created_at", hoursAgo(maxLookback))
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 1000);

  if (eventsError) throw new Error(eventsError.message);
  const eventRows = (events ?? []) as MarketingEventRow[];
  result.scannedEvents = eventRows.length;
  if (!eventRows.length) return result;

  const eventsByUser = new Map<string, MarketingEventRow[]>();

