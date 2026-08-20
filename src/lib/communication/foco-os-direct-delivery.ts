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
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id,full_name,email,phone")
    .in("id", userIds);
  if (profilesError) console.warn("[foco-os-direct-delivery] profiles lookup failed", profilesError.message);
  const profileMap = new Map<string, Profile>((profiles ?? []).map((row: Profile) => [row.id, row]));

  const candidates = [...latest.values()];
  const outcomes = await Promise.all(candidates.map(async ({ event, automation }) => {
    const metadata = event.metadata ?? {};
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
      recipient_email: profile.email ?? String(metadata.email ?? "") || null,
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
      plan: String(metadata.plan ?? metadata.plan_slug ?? ""),
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
