import { NextResponse } from "next/server";

import { requireAdmin, sanitizeText } from "../_lib/marketing-api";

const CHANNELS = new Set(["whatsapp", "email", "both"]);

function normalizeTemplate(template: any) {
  return {
    ...template,
    body: template.content ?? "",
    media_url: template.thumbnail_url ?? null,
    active: !template.is_system,
  };
}

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { data, error } = await admin
    .from("communication_templates")
    .select("id,created_at,updated_at,name,channel,category,thumbnail_url,content,html_content,text_content,is_premium,is_system")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: (data ?? []).map(normalizeTemplate) });
}

export async function POST(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const name = sanitizeText(body.name);
  const requestedChannel = sanitizeText(body.channel).toLowerCase();
  const channel = CHANNELS.has(requestedChannel) ? requestedChannel : "whatsapp";
  const templateBody = sanitizeText(body.body ?? body.content ?? body.text_content);

  if (!name) return NextResponse.json({ error: "Nome do template é obrigatório." }, { status: 400 });
  if (!templateBody) return NextResponse.json({ error: "Corpo do template é obrigatório." }, { status: 400 });

  const { data, error } = await admin
    .from("communication_templates")
    .insert({
      name,
      channel,
      category: sanitizeText(body.category) || "promocao",
      thumbnail_url: sanitizeText(body.thumbnail_url ?? body.media_url ?? body.mediaUrl) || null,
      content: templateBody,
      html_content: sanitizeText(body.html_content) || null,
      text_content: sanitizeText(body.text_content) || templateBody,
      is_premium: Boolean(body.is_premium ?? false),
      is_system: Boolean(body.is_system ?? false),
      updated_at: new Date().toISOString(),
    })
    .select("id,created_at,updated_at,name,channel,category,thumbnail_url,content,html_content,text_content,is_premium,is_system")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: normalizeTemplate(data) }, { status: 201 });
}
