import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Channel } from "@/types/communication";

type CommunicationQueueJob = {
  id: string;
  campaign_id: string | null;
  user_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: Channel;
  status: "pending" | "processing" | "sent" | "failed" | "canceled";
  attempts: number | null;
  scheduled_at: string | null;
  payload: Record<string, unknown> | null;
};

type CommunicationChannelRow = {
  id: string;
  type: Channel;
  provider: string;
  config: Record<string, unknown> | null;
};

type ProviderResult = { ok: boolean; provider: string; providerMessageId?: string | null; status?: number; response?: unknown; errorMessage?: string | null };
type ProcessCommunicationQueueResult = { processed: number; sent: number; failed: number; skipped: number; canceled: number; eligibleNow: number; scheduledLater: number };

const DEFAULT_PROCESS_LIMIT = 1;
const MAX_PROCESS_LIMIT = 1;
const MAX_WHATSAPP_PER_EXECUTION = 1;
const WHATSAPP_SAFE_WINDOW_LIMIT = 5;
const WHATSAPP_SAFE_WINDOW_MINUTES = 30;
const MAX_TEMPORARY_FAILURE_ATTEMPTS = 3;
const TEMPORARY_RETRY_DELAYS_MINUTES = [30, 60, 120];
const CONVERSION_EVENTS = new Set(["checkout_completed", "checkout.completed", "checkout.session.completed", "subscription_created", "subscription.created", "invoice.paid", "payment_succeeded", "payment.approved", "payment_confirmed", "payment_received", "plan.plus_activated", "plan.premium_activated"]);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function normalizeProcessLimit(limit: unknown) { const parsed = Math.floor(Number(limit)); if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PROCESS_LIMIT; return Math.min(parsed, MAX_PROCESS_LIMIT); }
function sanitizeText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function normalize(value: unknown) { return String(value ?? "").trim().toLowerCase(); }
function cleanRecipientName(value: unknown) { const text = sanitizeText(value); if (!text) return ""; if (text.includes("@")) return ""; if (/^https?:\/\//i.test(text)) return ""; return text; }
function resolveRecipientName(job: CommunicationQueueJob) { const payload = job.payload ?? {}; return cleanRecipientName(job.recipient_name) || cleanRecipientName(payload.display_name) || cleanRecipientName(payload.username) || cleanRecipientName(payload.recipient_name) || cleanRecipientName(payload.name) || cleanRecipientName(payload.full_name) || "Aluno"; }
function maskSecret(value: unknown) { const text = sanitizeText(value); if (!text) return ""; if (text.length <= 6) return "••••"; return `${text.slice(0, 3)}••••${text.slice(-2)}`; }
function normalizePhone(value: unknown) { return sanitizeText(value).replace(/\D/g, ""); }
function buildRecipient(job: CommunicationQueueJob) { if (job.channel === "email") return sanitizeText(job.recipient_email); return normalizePhone(job.recipient_phone); }
function buildMessage(job: CommunicationQueueJob) { const payload = job.payload ?? {}; const template = sanitizeText(payload.message) || sanitizeText(payload.text) || sanitizeText(payload.mensagem); const recipientName = resolveRecipientName(job); const link = sanitizeText(payload.link) || sanitizeText(payload.link_url); const plan = sanitizeText(payload.plano) || sanitizeText(payload.plan) || sanitizeText(payload.plan_slug); return template.replaceAll("{{nome}}", recipientName).replaceAll("{{link}}", link).replaceAll("{{plano}}", plan); }
function buildMediaUrl(job: CommunicationQueueJob) { const payload = job.payload ?? {}; return sanitizeText(payload.mediaUrl) || sanitizeText(payload.media_url) || sanitizeText(payload.imageUrl) || sanitizeText(payload.image); }
function getProviderMessageId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = sanitizeText(record.id) || sanitizeText(record.msgId) || sanitizeText(record.message_id) || sanitizeText(record.messageId) || sanitizeText(record.delivery_id);
  if (direct) return direct;
  if (record.data && typeof record.data === "object") return getProviderMessageId(record.data);
  return null;
}
function providerResponseAccepted(apiUrl: string, responseOk: boolean, responseBody: unknown, providerMessageId: string | null) {
  if (!responseOk) return false;
  if (!/wasenderapi\.com/i.test(apiUrl)) return true;
  if (!responseBody || typeof responseBody !== "object") return false;
  const record = responseBody as Record<string, unknown>;
  return record.success === true && Boolean(providerMessageId);
}
function safeJson(value: unknown) { try { return JSON.parse(JSON.stringify(value)); } catch { return null; } }
function shouldCancelIfConversion(job: CommunicationQueueJob) { return job.payload?.cancel_if_conversion === true || job.payload?.cancel_if_conversion === "true"; }
function triggerEventAt(job: CommunicationQueueJob) { const value = sanitizeText(job.payload?.trigger_event_at); return value || job.scheduled_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); }
function eventKey(value: unknown) { return normalize(value); }
function happenedAtOrAfter(value: unknown, since: string) { const valueMs = new Date(String(value ?? "")).getTime(); const sinceMs = new Date(since).getTime(); return Number.isFinite(valueMs) && Number.isFinite(sinceMs) && valueMs >= sinceMs; }
function isTemporaryProviderFailure(result: ProviderResult) { if (result.ok) return false; if (result.status === 429) return true; if (typeof result.status === "number" && result.status >= 500) return true; const message = normalize(result.errorMessage); return message.includes("rate limit") || message.includes("too many requests") || message.includes("timeout") || message.includes("aborted") || message.includes("fetch failed"); }
function retryDelayMinutes(attempts: number) { const index = Math.max(0, Math.min(attempts - 1, TEMPORARY_RETRY_DELAYS_MINUTES.length - 1)); return TEMPORARY_RETRY_DELAYS_MINUTES[index]; }

async function writeCommunicationLog(admin: any, input: { job: CommunicationQueueJob; event: string; level: "info" | "warning" | "error"; message: string; payload?: unknown; response?: unknown }) {
  const response = safeJson(input.response);
  const rawPayload = safeJson(input.payload) ?? {};
  const request = {
    ...(rawPayload && typeof rawPayload === "object" ? rawPayload as Record<string, unknown> : {}),
    job_id: input.job.id,
    campaign_id: input.job.campaign_id,
    user_id: input.job.user_id,
    channel: input.job.channel,
  };
  const { error } = await admin.from("communication_logs").insert({
    level: input.level,
    event: input.event,
    provider: sanitizeText(request.provider) || "communication_queue",
    request,
    response,
    message: input.message,
  });
  if (error) console.warn("[communication_queue] falha ao registrar log", { event: input.event, jobId: input.job.id, error: error.message });
}

async function getActiveChannel(admin: any, channel: Channel) { const table = channel === "whatsapp" ? "communication_whatsapp_integrations" : "communication_email_integrations"; const { data, error } = await admin.from(table).select("id,provider,config").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(); if (error) return { data: null, error }; return { data: data ? ({ ...data, type: channel } as CommunicationChannelRow) : null, error: null }; }
async function hasConversionAfterTrigger(admin: any, job: CommunicationQueueJob) { if (!job.user_id || !shouldCancelIfConversion(job)) return false; const since = triggerEventAt(job); const { data: events } = await admin.from("marketing_events").select("id,event_key,event_type,event_label,created_at").eq("user_id", job.user_id).gte("created_at", since).order("created_at", { ascending: false }).limit(20); if ((events ?? []).some((event: any) => CONVERSION_EVENTS.has(eventKey(event.event_key ?? event.event_type ?? event.event_label)))) return true; const { data: subscription } = await admin.from("subscriptions").select("status,updated_at,created_at").eq("user_id", job.user_id).in("status", Array.from(ACTIVE_SUBSCRIPTION_STATUSES)).order("updated_at", { ascending: false }).limit(1).maybeSingle(); if (!subscription?.status || !ACTIVE_SUBSCRIPTION_STATUSES.has(normalize(subscription.status))) return false; return happenedAtOrAfter(subscription.updated_at, since) || happenedAtOrAfter(subscription.created_at, since); }
async function cancelJobAfterConversion(admin: any, job: CommunicationQueueJob) { const now = new Date().toISOString(); await admin.from("communication_queue").update({ status: "canceled", processed_at: now, updated_at: now, error_message: "Cancelado automaticamente: conversão detectada antes do envio." }).eq("id", job.id).in("status", ["pending", "processing"]); await writeCommunicationLog(admin, { job: { ...job, status: "canceled" }, event: "communication.queue.canceled", level: "info", message: "Mensagem automática cancelada porque o usuário converteu/regularizou antes do envio.", payload: { job_id: job.id, automation_id: job.payload?.automation_id ?? null, automation_intent: job.payload?.automation_intent ?? null, trigger_event_at: job.payload?.trigger_event_at ?? null } }); }

async function hasWhatsappWindowCapacity(admin: any) {
  const since = new Date(Date.now() - WHATSAPP_SAFE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("communication_queue")
    .select("id", { count: "exact", head: true })
    .eq("channel", "whatsapp")
    .eq("status", "sent")
    .gte("processed_at", since);

  if (error) {
    console.warn("[communication_queue] falha ao verificar janela segura de WhatsApp", error.message);
    return false;
  }

  return Number(count ?? 0) < WHATSAPP_SAFE_WINDOW_LIMIT;
}

async function sendViaWebhook(job: CommunicationQueueJob, channel: CommunicationChannelRow): Promise<ProviderResult> {
  const config = channel.config ?? {};
  const apiUrl = sanitizeText(config.apiUrl);
  const apiToken = sanitizeText(config.apiToken);
  const instance = sanitizeText(config.instance);
  const recipient = buildRecipient(job);
  const recipientName = resolveRecipientName(job);
  const message = buildMessage(job);
  const mediaUrl = job.channel === "whatsapp" ? buildMediaUrl(job) : "";

  if (!apiUrl) return { ok: false, provider: channel.provider, errorMessage: "Canal ativo sem URL do provedor configurada." };
  if (!recipient) return { ok: false, provider: channel.provider, errorMessage: "Job sem destinatário válido." };
  if (!message) return { ok: false, provider: channel.provider, errorMessage: "Job sem mensagem." };

  const payload = { ...(job.payload ?? {}), job_id: job.id, campaign_id: job.campaign_id, user_id: job.user_id, channel: job.channel, instance, to: recipient, phone: job.channel === "whatsapp" ? recipient : undefined, number: job.channel === "whatsapp" ? recipient : undefined, whatsapp: job.channel === "whatsapp" ? recipient : undefined, email: job.channel === "email" ? recipient : job.recipient_email, recipient, recipient_name: recipientName, text: message, message, mensagem: message, ...(mediaUrl ? { mediaUrl, media_url: mediaUrl, imageUrl: mediaUrl, image: mediaUrl, caption: message } : {}), source: "harmomus.communication_queue", created_at: new Date().toISOString() };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiToken) headers.Authorization = `Bearer ${apiToken}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal }).finally(() => clearTimeout(timeout));
    const responseText = await response.text();
    let responseBody: unknown = responseText.slice(0, 5000);
    try { responseBody = responseText ? JSON.parse(responseText) : null; } catch { responseBody = responseText.slice(0, 5000); }
    const providerMessageId = getProviderMessageId(responseBody);
    const accepted = providerResponseAccepted(apiUrl, response.ok, responseBody, providerMessageId);
    const errorMessage = accepted
      ? null
      : response.ok
        ? "Provedor respondeu HTTP 2xx, mas não confirmou o aceite da mensagem nem retornou um ID válido."
        : `Provedor retornou HTTP ${response.status}.`;
    return { ok: accepted, provider: channel.provider, providerMessageId, status: response.status, response: responseBody, errorMessage };
  } catch (error) {
    return { ok: false, provider: channel.provider, errorMessage: error instanceof Error ? error.message : "Falha ao chamar provedor." };
  }
}

async function markJobProcessing(admin: any, job: CommunicationQueueJob) { const now = new Date().toISOString(); const attempts = Number(job.attempts ?? 0) + 1; const { data, error } = await admin.from("communication_queue").update({ status: "processing", attempts, updated_at: now }).eq("id", job.id).in("status", ["pending", "processing"]).or(`scheduled_at.is.null,scheduled_at.lte.${now}`).select("id,status,attempts").maybeSingle(); if (error || !data) return false; job.attempts = attempts; job.status = "processing"; await writeCommunicationLog(admin, { job, event: "communication.queue.processing", level: "info", message: "Job retirado da fila e marcado como processing.", payload: { job_id: job.id, attempts } }); return true; }
async function rescheduleTemporaryFailure(admin: any, job: CommunicationQueueJob, result: ProviderResult) { const now = new Date(); const attempts = Number(job.attempts ?? 0); const delayMinutes = retryDelayMinutes(attempts); const scheduledAt = new Date(now.getTime() + delayMinutes * 60 * 1000).toISOString(); const message = `${result.errorMessage ?? "Falha temporária no provedor."} Nova tentativa em ${delayMinutes} min.`; await admin.from("communication_queue").update({ status: "pending", scheduled_at: scheduledAt, processed_at: null, updated_at: now.toISOString(), provider: result.provider, provider_message_id: result.providerMessageId ?? null, error_message: message }).eq("id", job.id); await writeCommunicationLog(admin, { job: { ...job, status: "pending", scheduled_at: scheduledAt }, event: "communication.queue.retry_scheduled", level: "warning", message, payload: { job_id: job.id, provider: result.provider, status: "pending", attempts, max_attempts: MAX_TEMPORARY_FAILURE_ATTEMPTS, next_attempt_at: scheduledAt, provider_message_id: result.providerMessageId ?? null }, response: { status: result.status ?? 0, body: result.response ?? null, error: result.errorMessage ?? null } }); }
async function finalizeJob(admin: any, job: CommunicationQueueJob, result: ProviderResult): Promise<"sent" | "failed" | "retry_scheduled"> { const now = new Date().toISOString(); if (!result.ok && isTemporaryProviderFailure(result) && Number(job.attempts ?? 0) < MAX_TEMPORARY_FAILURE_ATTEMPTS) { await rescheduleTemporaryFailure(admin, job, result); return "retry_scheduled"; } const status = result.ok ? "sent" : "failed"; await admin.from("communication_queue").update({ status, processed_at: now, updated_at: now, provider: result.provider, provider_message_id: result.providerMessageId ?? null, error_message: result.errorMessage ?? null }).eq("id", job.id); await writeCommunicationLog(admin, { job: { ...job, status }, event: result.ok ? "communication.queue.sent" : "communication.queue.failed", level: result.ok ? "info" : "error", message: result.ok ? "Mensagem aceita pelo provedor configurado." : (result.errorMessage ?? "Falha ao enviar mensagem."), payload: { job_id: job.id, provider: result.provider, status, attempts: job.attempts ?? 0, provider_message_id: result.providerMessageId ?? null }, response: { status: result.status ?? 0, body: result.response ?? null, error: result.errorMessage ?? null } }); return status; }

export async function processCommunicationQueue(limit = DEFAULT_PROCESS_LIMIT): Promise<ProcessCommunicationQueueResult> {
  const admin = createSupabaseAdminClient() as any;
  const safeLimit = normalizeProcessLimit(limit);
  const now = new Date().toISOString();
  const { count: eligibleNow } = await admin.from("communication_queue").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]).or(`scheduled_at.is.null,scheduled_at.lte.${now}`);
  const { count: scheduledLater } = await admin.from("communication_queue").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]).gt("scheduled_at", now);
  const { data: jobs, error } = await admin.from("communication_queue").select("id,campaign_id,user_id,recipient_name,recipient_email,recipient_phone,channel,status,attempts,scheduled_at,payload").in("status", ["pending", "processing"]).or(`scheduled_at.is.null,scheduled_at.lte.${now}`).order("created_at", { ascending: true }).limit(safeLimit);

  if (error || !jobs?.length) return { processed: 0, sent: 0, failed: 0, skipped: 0, canceled: 0, eligibleNow: eligibleNow ?? 0, scheduledLater: scheduledLater ?? 0 };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let canceled = 0;
  let retryScheduled = 0;
  let whatsappProcessed = 0;
  const channels = new Map<Channel, CommunicationChannelRow | null>();

  for (const job of jobs as CommunicationQueueJob[]) {
    if (job.channel === "whatsapp") {
      if (whatsappProcessed >= MAX_WHATSAPP_PER_EXECUTION) { skipped += 1; continue; }
      if (!(await hasWhatsappWindowCapacity(admin))) { skipped += 1; continue; }
    }
    const locked = await markJobProcessing(admin, job);
    if (!locked) { skipped += 1; continue; }
    if (await hasConversionAfterTrigger(admin, job)) { await cancelJobAfterConversion(admin, job); canceled += 1; continue; }
    if (!channels.has(job.channel)) { const { data: channel } = await getActiveChannel(admin, job.channel); channels.set(job.channel, channel); }
    const channel = channels.get(job.channel);
    const result = channel ? await sendViaWebhook(job, channel) : { ok: false, provider: "not_configured", errorMessage: `Canal ${job.channel} ativo não configurado.` };
    const finalStatus = await finalizeJob(admin, job, result);
    if (job.channel === "whatsapp") whatsappProcessed += 1;
    if (finalStatus === "sent") sent += 1;
    else if (finalStatus === "failed") failed += 1;
    else retryScheduled += 1;
  }

  return { processed: sent + failed + canceled + retryScheduled, sent, failed, skipped, canceled, eligibleNow: eligibleNow ?? 0, scheduledLater: scheduledLater ?? 0 };
}

export function scrubProviderConfig(config: Record<string, unknown> | null) { return { ...(config ?? {}), apiToken: maskSecret(config?.apiToken) }; }
