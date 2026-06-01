import { NextResponse } from "next/server";

import { requireAdmin, sanitizeObject, sanitizeText } from "../_lib/marketing-api";

function sanitizeFileSize(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { data, error } = await admin
    .from("communication_assets")
    .select("id,created_at,updated_at,file_name,file_type,file_size,public_url,purpose,metadata")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const fileName = sanitizeText(body.file_name);
  const publicUrl = sanitizeText(body.public_url);
  if (!fileName) return NextResponse.json({ error: "Nome do arquivo é obrigatório." }, { status: 400 });
  if (!publicUrl) return NextResponse.json({ error: "URL pública é obrigatória." }, { status: 400 });

  const { data, error } = await admin
    .from("communication_assets")
    .insert({
      file_name: fileName,
      file_type: sanitizeText(body.file_type) || null,
      file_size: sanitizeFileSize(body.file_size),
      public_url: publicUrl,
      purpose: sanitizeText(body.purpose) || "campaign",
      metadata: sanitizeObject(body.metadata),
      updated_at: new Date().toISOString(),
    })
    .select("id,created_at,updated_at,file_name,file_type,file_size,public_url,purpose,metadata")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
