import { NextResponse } from "next/server";

import { requireAdmin, sanitizeText } from "../../_lib/marketing-api";

const ALLOWED_STATUS = new Set(["draft", "active", "paused", "archived"]);
const ALLOWED_CHANNELS = new Set(["whatsapp", "email"]);

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function sanitizeJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const currentResult = await admin
    .from("marketing_automations")
    .select("id,name,description,trigger_event,intent,priority,score_weight,score_threshold,lookback_hours,cooldown_hours,status,channel,message_template,cta_url,audience_rule,metadata")
    .eq("id", id)
    .maybeSingle();

  if (currentResult.error) return NextResponse.json({ error: currentResult.error.message }, { status: 500 });
  if (!currentResult.data) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });

  const current = currentResult.data as any;
  const status = sanitizeText(body.status) || current.status;
  const channel = sanitizeText(body.channel) || current.channel;

  if (!ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }
  if (!ALLOWED_CHANNELS.has(channel)) {
    return NextResponse.json({ error: "Canal inválido." }, { status: 400 });
  }

  const patch = {
    name: sanitizeText(body.name).slice(0, 160) || current.name,
    description: body.description === undefined ? current.description : sanitizeText(body.description).slice(0, 600) || null,
    trigger_event: current.trigger_event,
    intent: current.intent,
    priority: sanitizeNumber(body.priority, current.priority ?? 100, 1, 999),
    score_weight: sanitizeNumber(body.score_weight ?? body.scoreWeight, current.score_weight ?? 1, 1, 100),
    score_threshold: sanitizeNumber(body.score_threshold ?? body.scoreThreshold, current.score_threshold ?? 8, 1, 1000),
    lookback_hours: sanitizeNumber(body.lookback_hours ?? body.lookbackHours, current.lookback_hours ?? 168, 1, 8760),
    cooldown_hours: sanitizeNumber(body.cooldown_hours ?? body.cooldownHours, current.cooldown_hours ?? 72, 0, 8760),
    channel,
    status,
    message_template: sanitizeText(body.message_template ?? body.messageTemplate).slice(0, 3000) || current.message_template,
    cta_url: body.cta_url === undefined && body.ctaUrl === undefined ? current.cta_url : sanitizeText(body.cta_url ?? body.ctaUrl).slice(0, 1000) || null,
    audience_rule: body.audience_rule === undefined && body.audienceRule === undefined ? current.audience_rule : sanitizeJsonObject(body.audience_rule ?? body.audienceRule),
    metadata: body.metadata === undefined ? current.metadata : sanitizeJsonObject(body.metadata),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("marketing_automations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
