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
  status: "pending" | "processing" | "sent" | "failed";
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

type ProviderResult = {
  ok: boolean;
  provider: string;
  providerMessageId?: string | null;
  status?: number;
  response?: unknown;
  errorMessage?: string | null;
};

type ProcessCommunicationQueueResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  eligibleNow: number;
  scheduledLater: number;
};

const DEFAULT_PROCESS_LIMIT = 2;
const MAX_PROCESS_LIMIT = 5;
const MAX_WHATSAPP_PER_EXECUTION = 2;

function normalizeProcessLimit(limit: unknown) {
  const parsed = Math.floor(Number(limit));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PROCESS_LIMIT;
  return Math.min(parsed, MAX_PROCESS_LIMIT);
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function maskSecret(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return "";
  if (text.length <= 6) return "••••";
  return `${text.slice(0, 3)}••••${text.slice(-2)}`;
}

function normalizePhone(value: unknown) {
  return sanitizeText(value).replace(/\D/g, "");
}

function buildRecipient(job: CommunicationQueueJob) {
  if (job.channel === "email") return sanitizeText(job.recipient_email);
  return normalizePhone(job.recipient_phone);
}

function buildMessage(job: CommunicationQueueJob) {
  const payload = job.payload ?? {};
  const template =
    sanitizeText(payload.message) ||
    sanitizeText(payload.text) ||
    sanitizeText(payload.mensagem);
  const recipientName =
    sanitizeText(job.recipient_name) ||
    sanitizeText(payload.recipient_name) ||
    sanitizeText(payload.name) ||
    "Aluno";
  const link = sanitizeText(payload.link) || sanitizeText(payload.link_url);
  const plan =
    sanitizeText(payload.plano) ||
    sanitizeText(payload.plan) ||
    sanitizeText(payload.plan_slug);

  return template
    .replaceAll("{{nome}}", recipientName)
    .replaceAll("{{link}}", link)
    .replaceAll("{{plano}}", plan);
}

function buildMediaUrl(job: CommunicationQueueJob) {
  const payload = job.payload ?? {};
  return (
    sanitizeText(payload.mediaUrl) ||
    sanitizeText(payload.media_url) ||
    sanitizeText(payload.imageUrl) ||
    sanitizeText(payload.image)
  );
}

function getProviderMessageId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return (
    sanitizeText(record.id) ||
    sanitizeText(record.message_id) ||
    sanitizeText(record.messageId) ||
    sanitizeText(record.delivery_id) ||
    null
  );
}

function safeJson(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

async function writeCommunicationLog(
  admin: any,
  input: {
    job: CommunicationQueueJob;
    event: string;
    level: "info" | "warning" | "error";
    message: string;
    payload?: unknown;
    response?: unknown;
  },
) {
  const now = new Date().toISOString();
  await admin.from("communication_logs").insert({
    campaign_id: input.job.campaign_id,
    user_id: input.job.user_id,
    channel: input.job.channel,
    status: input.event.endsWith("sent")
      ? "sent"
      : input.event.endsWith("failed")
        ? "failed"
        : input.event.endsWith("processing")
          ? "processing"
          : input.job.status,
    provider_message_id:
      typeof (safeJson(input.response) as Record<string, unknown> | null)
        ?.provider_message_id === "string"
        ? String(
            (safeJson(input.response) as Record<string, unknown>)
              .provider_message_id,
          )
        : null,
    details: {
      event: input.event,
      level: input.level,
      message: input.message,
      job_id: input.job.id,
      payload: safeJson(input.payload) ?? {},
      response: safeJson(input.response),
      updated_at: now,
    },
  });
}

async function getActiveChannel(admin: any, channel: Channel) {
  const table =
    channel === "whatsapp"
      ? "communication_whatsapp_integrations"
      : "communication_email_integrations";
  const { data, error } = await admin
    .from(table)
    .select("id,provider,config")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error };
  return {
    data: data ? ({ ...data, type: channel } as CommunicationChannelRow) : null,
    error: null,
  };
}

async function sendViaWebhook(
  job: CommunicationQueueJob,
  channel: CommunicationChannelRow,
): Promise<ProviderResult> {
  const config = channel.config ?? {};
  const apiUrl = sanitizeText(config.apiUrl);
  const apiToken = sanitizeText(config.apiToken);
  const instance = sanitizeText(config.instance);
  const recipient = buildRecipient(job);
  const message = buildMessage(job);
  const mediaUrl = job.channel === "whatsapp" ? buildMediaUrl(job) : "";

  if (!apiUrl) {
    return {
      ok: false,
      provider: channel.provider,
      errorMessage: "Canal ativo sem URL do provedor configurada.",
    };
  }
  if (!recipient) {
    return {
      ok: false,
      provider: channel.provider,
      errorMessage: "Job sem destinatário válido.",
    };
  }
  if (!message) {
    return {
      ok: false,
      provider: channel.provider,
      errorMessage: "Job sem mensagem.",
    };
  }

  const payload = {
    ...(job.payload ?? {}),
    job_id: job.id,
    campaign_id: job.campaign_id,
    user_id: job.user_id,
    channel: job.channel,
    instance,
    to: recipient,
    phone: job.channel === "whatsapp" ? recipient : undefined,
    number: job.channel === "whatsapp" ? recipient : undefined,
    whatsapp: job.channel === "whatsapp" ? recipient : undefined,
    email: job.channel === "email" ? recipient : job.recipient_email,
    recipient,
    recipient_name: job.recipient_name,
    text: message,
    message,
    mensagem: message,
    ...(mediaUrl
      ? {
          mediaUrl,
          media_url: mediaUrl,
          imageUrl: mediaUrl,
          image: mediaUrl,
          caption: message,
        }
      : {}),
    source: "harmomus.communication_queue",
    created_at: new Date().toISOString(),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
    headers["X-Api-Key"] = apiToken;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const responseText = await response.text();
    let responseBody: unknown = responseText.slice(0, 5000);
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = responseText.slice(0, 5000);
    }

    return {
      ok: response.ok,
      provider: channel.provider,
      providerMessageId: getProviderMessageId(responseBody),
      status: response.status,
      response: responseBody,
      errorMessage: response.ok
        ? null
        : `Provedor retornou HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      provider: channel.provider,
      errorMessage:
        error instanceof Error ? error.message : "Falha ao chamar provedor.",
    };
  }
}

async function markJobProcessing(admin: any, job: CommunicationQueueJob) {
  const now = new Date().toISOString();
  const attempts = Number(job.attempts ?? 0) + 1;
  const { data, error } = await admin
    .from("communication_queue")
    .update({ status: "processing", attempts, updated_at: now })
    .eq("id", job.id)
    .in("status", ["pending", "processing"])
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
    .select("id,status,attempts")
    .maybeSingle();

  if (error || !data) return false;
  job.attempts = attempts;
  job.status = "processing";
  await writeCommunicationLog(admin, {
    job,
    event: "communication.queue.processing",
    level: "info",
    message: "Job retirado da fila e marcado como processing.",
    payload: { job_id: job.id, attempts },
  });
  return true;
}

async function finalizeJob(
  admin: any,
  job: CommunicationQueueJob,
  result: ProviderResult,
) {
  const now = new Date().toISOString();
  const status = result.ok ? "sent" : "failed";
  await admin
    .from("communication_queue")
    .update({
      status,
      processed_at: now,
      updated_at: now,
      provider: result.provider,
      provider_message_id: result.providerMessageId ?? null,
      error_message: result.errorMessage ?? null,
    })
    .eq("id", job.id);

  await writeCommunicationLog(admin, {
    job: { ...job, status },
    event: result.ok
      ? "communication.queue.sent"
      : "communication.queue.failed",
    level: result.ok ? "info" : "error",
    message: result.ok
      ? "Mensagem enviada pelo provedor configurado."
      : (result.errorMessage ?? "Falha ao enviar mensagem."),
    payload: {
      job_id: job.id,
      provider: result.provider,
      status,
      provider_message_id: result.providerMessageId ?? null,
    },
    response: {
      status: result.status ?? 0,
      body: result.response ?? null,
      error: result.errorMessage ?? null,
    },
  });
}

export async function processCommunicationQueue(
  limit = DEFAULT_PROCESS_LIMIT,
): Promise<ProcessCommunicationQueueResult> {
  const admin = createSupabaseAdminClient() as any;
  const safeLimit = normalizeProcessLimit(limit);
  const now = new Date().toISOString();
  const { count: eligibleNow } = await admin
    .from("communication_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "processing"])
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`);
  const { count: scheduledLater } = await admin
    .from("communication_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "processing"])
    .gt("scheduled_at", now);

  const { data: jobs, error } = await admin
    .from("communication_queue")
    .select(
      "id,campaign_id,user_id,recipient_name,recipient_email,recipient_phone,channel,status,attempts,scheduled_at,payload",
    )
    .in("status", ["pending", "processing"])
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  if (error || !jobs?.length)
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      eligibleNow: eligibleNow ?? 0,
      scheduledLater: scheduledLater ?? 0,
    };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let whatsappProcessed = 0;
  const channels = new Map<Channel, CommunicationChannelRow | null>();

  for (const job of jobs as CommunicationQueueJob[]) {
    if (job.channel === "whatsapp" && whatsappProcessed >= MAX_WHATSAPP_PER_EXECUTION) {
      skipped += 1;
      continue;
    }

    const locked = await markJobProcessing(admin, job);
    if (!locked) {
      skipped += 1;
      continue;
    }

    if (!channels.has(job.channel)) {
      const { data: channel } = await getActiveChannel(admin, job.channel);
      channels.set(job.channel, channel);
    }

    const channel = channels.get(job.channel);
    const result = channel
      ? await sendViaWebhook(job, channel)
      : {
          ok: false,
          provider: "not_configured",
          errorMessage: `Canal ${job.channel} ativo não configurado.`,
        };

    await finalizeJob(admin, job, result);
    if (job.channel === "whatsapp") whatsappProcessed += 1;
    if (result.ok) sent += 1;
    else failed += 1;
  }

  return {
    processed: sent + failed,
    sent,
    failed,
    skipped,
    eligibleNow: eligibleNow ?? 0,
    scheduledLater: scheduledLater ?? 0,
  };
}

export function scrubProviderConfig(config: Record<string, unknown> | null) {
  return { ...(config ?? {}), apiToken: maskSecret(config?.apiToken) };
}
