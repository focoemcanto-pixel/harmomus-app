import { NextResponse } from "next/server";

import { getCreatedBy, isMissingCommunicationTable, communicationTableErrorResponse, requireAdmin, sanitizeObject, sanitizeStringArray, sanitizeText } from "../_lib/marketing-api";

const CHANNELS = new Set(["whatsapp", "email"]);

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { data, error } = await admin
    .from("communication_campaigns")
    .select("id,created_at,updated_at,name,status,channels,audience_filters,title,message,link_url,schedule_mode,scheduled_at,rate_limits,stats")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingCommunicationTable(error)) return communicationTableErrorResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const { admin, current, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const name = sanitizeText(body.name);
  const message = sanitizeText(body.message);
  const channels = sanitizeStringArray(body.channels, CHANNELS);
  const scheduleMode = sanitizeText(body.schedule_mode) === "scheduled" ? "scheduled" : "now";
  const scheduledAt = scheduleMode === "scheduled" ? sanitizeText(body.scheduled_at) : "";

  if (!name) return NextResponse.json({ error: "Nome da campanha é obrigatório." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Mensagem da campanha é obrigatória." }, { status: 400 });
  if (!channels.length) return NextResponse.json({ error: "Selecione pelo menos um canal." }, { status: 400 });

  const record = {
    name,
    status: "draft",
    channel: channels[0],
    channels,
    audience_type: sanitizeText(body.audience_type) || sanitizeText(body.segment_slug) || "custom",
    segment_slug: sanitizeText(body.segment_slug) || sanitizeText(sanitizeObject(body.audience_filters).segment) || null,
    audience_filters: sanitizeObject(body.audience_filters),
    title: sanitizeText(body.title) || null,
    message,
    link_url: sanitizeText(body.link_url) || null,
    schedule_mode: scheduleMode,
    scheduled_at: scheduledAt || null,
    rate_limits: sanitizeObject(body.rate_limits),
    created_by: getCreatedBy(current.profile?.id),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("communication_campaigns")
    .insert(record)
    .select("id,created_at,updated_at,name,status,channels,audience_filters,title,message,link_url,schedule_mode,scheduled_at,rate_limits,stats")
    .single();

  if (error) {
    if (isMissingCommunicationTable(error)) return communicationTableErrorResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
