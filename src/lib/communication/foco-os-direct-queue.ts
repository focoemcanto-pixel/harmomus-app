import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Automation = {
  id: string;
  name: string;
  trigger_event: string;
  intent: string;
  channel: "whatsapp" | "email";
  message_template: string;
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

function phone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function name(value: unknown) {
  const text = String(value ?? "").trim();
  return text && !text.includes("@") ? text : "Aluno";
}

function absoluteUrl(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return text.startsWith("/") ? `https://harmomus.com${text}` : text;
}

function render(template: string, automation: Automation, event: EventRow, profile: Profile) {
  const metadata = event.metadata ?? {};
  const link = absoluteUrl(automation.cta_url);
  const plan = String(metadata.plan ?? metadata.plan_slug ?? "");
  const amountCents = Number(metadata.amount_paid_cents ?? metadata.amount_due_cents ?? 0);
  const amount = amountCents > 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountCents / 100)
    : "";

  return String(template ?? "")
    .replace(/{{\s*nome\s*}}/gi, name(profile.full_name ?? metadata.full_name ?? metadata.name))
    .replace(/{{\s*email\s*}}/gi, String(profile.email ?? metadata.email ?? ""))
    .replace(/{{\s*link\s*}}/gi, link)
    .replace(/{{\s*plano\s*}}/gi, plan)
    .replace(/{{\s*valor\s*}}/gi, amount);
}

async function getOrCreateCampaign(admin: any, automation: Automation) {
  const campaignName = `[FOCO OS] ${automation.name}`;
  const { data: existing } = await admin
    .from("communication_campaigns")
    .select("id")
    .eq("name", campaignName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return String(existing.id);

  const { data, error } = await admin
    .from("communication_campaigns")
    .insert({
      name: campaignName,
      status: "queued",
      channels: [automation.channel],
      title: automation.name,
      message: automation.message_template || automation.name,
      schedule_mode: "now",
      audience_filters: { source: "foco_os_manual", automation_id: automation.id },
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`campaign:${error.message}`);
  return String(data.id);
}

export async function buildFocoOsManualJobs(limit = 100) {
  const admin = createSupabaseAdminClient() as any;
  const result = {
    scannedAutomations: 0,
    scannedEvents: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
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

  const byTrigger = new Map(active.map((item) => [normalize(item.trigger_event), item]));
  const triggers = [...byTrigger.keys()];

  const { data: events, error: eventsError } = await admin
    .from("marketing_events")
    .select("id,user_id,event_key,event_label,metadata,created_at")
    .not("user_id", "is", null)
    .in("event_key", triggers)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventsError) throw new Error(`events:${eventsError.message}`);
  const rows = (events ?? []) as EventRow[];
  result.scannedEvents = rows.length;
  if (!rows.length) return result;

  // A Central precisa de uma ação atual por usuário/situação, não várias cópias
  // do mesmo problema. Mantemos o evento mais recente de cada automação+usuário.
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

  if (profilesError) console.warn("[foco-os-direct-queue] profiles lookup failed", profilesError.message);
  const profileMap = new Map<string, Profile>((profiles ?? []).map((row: Profile) => [row.id, row]));

  for (const { event, automation } of latest.values()) {
    try {
      const metadata = event.metadata ?? {};
      const profile = profileMap.get(event.user_id) ?? {
        id: event.user_id,
        full_name: String(metadata.full_name ?? metadata.name ?? "Aluno"),
        email: String(metadata.email ?? "") || null,
        phone: String(metadata.phone ?? metadata.whatsapp ?? "") || null,
      };
      const recipientPhone = phone(profile.phone ?? metadata.phone ?? metadata.whatsapp);
      if (recipientPhone.length < 10) {
        result.skipped += 1;
        result.details.push({ user_id: event.user_id, event_id: event.id, status: "skipped", reason: "missing_phone" });
        continue;
      }

      const { data: manualExisting } = await admin
        .from("communication_queue")
        .select("id,status")
        .eq("user_id", event.user_id)
        .eq("payload->>automation_id", automation.id)
        .eq("payload->>trigger_event_id", event.id)
        .eq("payload->>delivery_mode", "foco_os_manual")
        .limit(1)
        .maybeSingle();

      if (manualExisting?.id) {
        result.skipped += 1;
        result.details.push({ user_id: event.user_id, event_id: event.id, status: "skipped", reason: "already_in_foco_os" });
        continue;
      }

      const message = render(automation.message_template, automation, event, profile);
      const link = absoluteUrl(automation.cta_url);
      const payload = {
        message,
        automation_id: automation.id,
        automation_intent: automation.intent,
        trigger_event_id: event.id,
        trigger_event_key: event.event_key,
        trigger_event_at: event.created_at,
        delivery_mode: "foco_os_manual",
        source_product: "harmomus",
        link,
        link_url: link,
        plan: String(metadata.plan ?? metadata.plan_slug ?? ""),
        transactional: normalize(event.event_key).startsWith("subscription."),
      };

      // Se o motor antigo já deixou um job pendente para a mesma automação,
      // reaproveitamos esse job e apenas o convertemos para a fila manual.
      const { data: legacy } = await admin
        .from("communication_queue")
        .select("id,status,payload")
        .eq("user_id", event.user_id)
        .eq("channel", "whatsapp")
        .eq("payload->>automation_id", automation.id)
        .in("status", ["pending", "processing", "queued"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (legacy?.id) {
        const { error: updateError } = await admin
          .from("communication_queue")
          .update({
            recipient_name: name(profile.full_name),
            recipient_email: profile.email ?? null,
            recipient_phone: recipientPhone,
            status: "pending",
            scheduled_at: null,
            processed_at: null,
            error_message: null,
            payload: { ...(legacy.payload ?? {}), ...payload },
            updated_at: new Date().toISOString(),
          })
          .eq("id", legacy.id);
        if (updateError) throw new Error(`convert_legacy:${updateError.message}`);
        result.queued += 1;
        result.convertedLegacy += 1;
        result.details.push({ user_id: event.user_id, event_id: event.id, queue_id: legacy.id, status: "queued", mode: "converted_legacy" });
        continue;
      }

      const campaignId = await getOrCreateCampaign(admin, automation);
      const { data: created, error: insertError } = await admin
        .from("communication_queue")
        .insert({
          campaign_id: campaignId,
          user_id: event.user_id,
          recipient_name: name(profile.full_name),
          recipient_email: profile.email ?? null,
          recipient_phone: recipientPhone,
          channel: "whatsapp",
          status: "pending",
          scheduled_at: null,
          payload,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) throw new Error(`queue:${insertError.message}`);
      result.queued += 1;
      result.details.push({ user_id: event.user_id, event_id: event.id, queue_id: created.id, status: "queued", mode: "created" });
    } catch (error) {
      result.failed += 1;
      result.details.push({
        user_id: event.user_id,
        event_id: event.id,
        status: "failed",
        reason: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return result;
}
