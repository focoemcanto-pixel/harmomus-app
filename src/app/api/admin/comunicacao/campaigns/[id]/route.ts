import { NextResponse } from "next/server";

import { requireAdmin, sanitizeObject, sanitizeStringArray, sanitizeText } from "../../_lib/marketing-api";

const MANAGED_QUEUE_STATUSES = ["pending", "processing", "paused"];
const CHANNELS = new Set(["whatsapp", "email"]);

async function getCampaign(admin: any, id: string) {
  const { data, error } = await admin
    .from("communication_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

async function updateQueueStatus(admin: any, id: string, from: string[], to: string) {
  const { error, count } = await admin
    .from("communication_queue")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("campaign_id", id)
    .in("status", from)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  try {
    const campaign = await getCampaign(admin, id);
    if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

    const { data: queue, error: queueError } = await admin
      .from("communication_queue")
      .select("id,status,channel,recipient_name,recipient_phone,recipient_email,payload,created_at,processed_at,error_message,last_error")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (queueError) throw new Error(queueError.message);

    return NextResponse.json({ data: { campaign, queue: queue ?? [] } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar campanha." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, current, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = sanitizeText(body?.action);

  try {
    const campaign = await getCampaign(admin, id);
    if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

    if (action === "duplicate") {
      const now = new Date().toISOString();
      const { id: _oldId, created_at: _createdAt, updated_at: _updatedAt, sent_at: _sentAt, ...copy } = campaign;
      const { data, error } = await admin
        .from("communication_campaigns")
        .insert({
          ...copy,
          name: `Cópia de ${sanitizeText(campaign.name) || "campanha"}`,
          status: "draft",
          sent_at: null,
          scheduled_at: null,
          total_recipients: 0,
          total_sent: 0,
          total_delivered: 0,
          total_opened: 0,
          total_clicked: 0,
          total_failed: 0,
          total_converted: 0,
          created_by: current.profile?.id ?? campaign.created_by ?? null,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ data: { id: data.id, action } }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao executar ação." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = sanitizeText(body?.action);
  const now = new Date().toISOString();

  try {
    if (action === "pause") {
      const affected = await updateQueueStatus(admin, id, ["pending", "processing"], "paused");
      const { error } = await admin.from("communication_campaigns").update({ status: "paused", updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ data: { action, affected } });
    }

    if (action === "resume") {
      const affected = await updateQueueStatus(admin, id, ["paused"], "pending");
      const { error } = await admin.from("communication_campaigns").update({ status: "queued", updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ data: { action, affected } });
    }

    if (action === "cancel") {
      const affected = await updateQueueStatus(admin, id, MANAGED_QUEUE_STATUSES, "canceled");
      const { error } = await admin.from("communication_campaigns").update({ status: "canceled", updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ data: { action, affected } });
    }

    if (action) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

    const name = sanitizeText(body?.name);
    const message = sanitizeText(body?.message ?? body?.text_content ?? body?.text);
    const channels = sanitizeStringArray(body?.channels, CHANNELS);
    const audienceFilters = sanitizeObject(body?.audience_filters);
    const scheduleMode = sanitizeText(body?.schedule_mode) === "scheduled" ? "scheduled" : "now";
    const scheduledAt = scheduleMode === "scheduled" ? sanitizeText(body?.scheduled_at) : "";
    const title = sanitizeText(body?.title) || name;

    if (!name) return NextResponse.json({ error: "Nome da campanha é obrigatório." }, { status: 400 });
    if (!message) return NextResponse.json({ error: "Mensagem da campanha é obrigatória." }, { status: 400 });
    if (!channels.length) return NextResponse.json({ error: "Selecione pelo menos um canal." }, { status: 400 });

    const content = {
      title,
      link_url: sanitizeText(body?.link_url) || null,
      media_url: sanitizeText(body?.media_url ?? body?.mediaUrl) || null,
      kit_id: sanitizeText(body?.kit_id ?? body?.kitId) || null,
      channels,
      schedule_mode: scheduleMode,
      rate_limits: sanitizeObject(body?.rate_limits),
      audience_filters: audienceFilters,
    };

    const { data, error } = await admin
      .from("communication_campaigns")
      .update({
        name,
        channel: channels[0] ?? "whatsapp",
        audience_type: sanitizeText(audienceFilters.segment ?? audienceFilters.audience_type) || "custom",
        subject: title,
        preview_text: message.slice(0, 180),
        text_content: message,
        content,
        scheduled_at: scheduledAt || null,
        updated_at: now,
      })
      .eq("id", id)
      .select("id,created_at,updated_at,name,status,channel,audience_type,subject,text_content,scheduled_at,content")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar campanha." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  try {
    const campaign = await getCampaign(admin, id);
    if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

    const tables = ["communication_queue", "communication_deliveries", "communication_logs"];
    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq("campaign_id", id);
      if (error) throw new Error(error.message);
    }

    const { error: campaignError } = await admin
      .from("communication_campaigns")
      .delete()
      .eq("id", id);
    if (campaignError) throw new Error(campaignError.message);

    return NextResponse.json({ data: { id, deleted: true } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao excluir campanha." },
      { status: 500 },
    );
  }
}
