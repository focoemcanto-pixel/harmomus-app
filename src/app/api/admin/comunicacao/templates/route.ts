import { NextResponse } from "next/server";

import { requireAdmin, sanitizeStringArray, sanitizeText } from "../_lib/marketing-api";

const CHANNELS = new Set(["whatsapp", "email"]);

function normalizeTemplate(template: any) {
  return {
    ...template,
    body: template.content,
    media_url: template.media_url ?? null,
  };
}

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { data, error } = await admin
    .from("communication_templates")
    .select("id,created_at,updated_at,name,channel,category,subject,content,variables,active")
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
  const channel = CHANNELS.has(sanitizeText(body.channel)) ? sanitizeText(body.channel) : "whatsapp";
  const templateBody = sanitizeText(body.body);

  if (!name) return NextResponse.json({ error: "Nome do template é obrigatório." }, { status: 400 });
  if (!templateBody) return NextResponse.json({ error: "Corpo do template é obrigatório." }, { status: 400 });

  const variables = sanitizeStringArray(body.variables).length ? sanitizeStringArray(body.variables) : ["nome", "email", "plano", "link"];

  const { data, error } = await admin
    .from("communication_templates")
    .insert({
      name,
      channel,
      category: sanitizeText(body.category) || "promocao",
      subject: sanitizeText(body.subject) || null,
      content: templateBody,
      variables,
      active: Boolean(body.active ?? true),
      updated_at: new Date().toISOString(),
    })
    .select("id,created_at,updated_at,name,channel,category,subject,content,variables,active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: normalizeTemplate(data) }, { status: 201 });
}
