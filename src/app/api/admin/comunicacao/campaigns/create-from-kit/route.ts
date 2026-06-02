import { NextResponse } from "next/server";

import { getCreatedBy, requireAdmin, sanitizeText } from "../../_lib/marketing-api";

function baseUrlFromRequest(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

export async function POST(request: Request) {
  const { admin, current, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const kitId = sanitizeText(body?.kitId ?? body?.kit_id);
  if (!kitId) return NextResponse.json({ error: "Kit invalido." }, { status: 400 });

  const { data: kit, error: kitError } = await admin.from("kits").select("id,name,slug,cover_url,published").eq("id", kitId).maybeSingle();
  if (kitError) return NextResponse.json({ error: kitError.message }, { status: 500 });
  if (!kit?.id) return NextResponse.json({ error: "Kit nao encontrado." }, { status: 404 });
  if (kit.published !== true) return NextResponse.json({ error: "Publique o kit antes de criar a campanha." }, { status: 400 });

  const linkUrl = `${baseUrlFromRequest(request)}/biblioteca/${kit.slug}`;
  const title = `Novo kit disponivel: ${kit.name}`;
  const text = "Ola {{nome}}!\n\nTem novidade no Harmomus.\n\nAcabamos de liberar um novo kit vocal para ajudar voce a estudar com mais organizacao e seguranca vocal.\n\nAcesse agora: {{link}}";
  const channels = ["whatsapp"];
  const content = {
    title,
    kit_id: kit.id,
    link_url: linkUrl,
    media_url: kit.cover_url || null,
    channels,
    schedule_mode: "now",
    rate_limits: { minDelay: 8, maxDelay: 25, hourlyLimit: 120, dailyLimit: 600, pauseEvery: 80, pauseMinutes: 10 },
    audience_filters: { plans: ["premium", "plus"], segment: "premium,plus", note: "Campanha automatica criada a partir de um kit." },
  };

  const { data, error } = await admin.from("communication_campaigns").insert({
    name: `Lancamento de kit vocal - ${kit.name}`,
    slug: slugify(`novo-kit-${kit.slug}-${Date.now()}`),
    status: "draft",
    channel: "whatsapp",
    audience_type: "premium,plus",
    subject: title,
    preview_text: text.slice(0, 180),
    text_content: text,
    content,
    created_by: getCreatedBy(current.profile?.id),
    updated_at: new Date().toISOString(),
  }).select("id,name,status,channel,subject,text_content,content,created_at,updated_at").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
