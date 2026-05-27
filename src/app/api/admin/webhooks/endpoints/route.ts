import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { generateWebhookSecret } from "@/lib/webhooks/core";
import { WEBHOOK_EVENTS } from "@/types/webhooks";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("webhook_endpoints").select("id,created_at,updated_at,name,url,environment,active,retry_enabled,retry_attempts,created_by,events,last_triggered_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const body = await request.json();
  const admin = createSupabaseAdminClient();
  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "URL de webhook inválida." }, { status: 400 });
  }
  const events = Array.isArray(body.events)
    ? Array.from(new Set((body.events as unknown[]).filter((event): event is string => typeof event === "string" && WEBHOOK_EVENTS.includes(event))))
    : [];
  if (events.length === 0) return NextResponse.json({ error: "Selecione ao menos um evento para o webhook." }, { status: 400 });

  const payload = {
    name,
    url,
    environment: body.environment === "test" ? "test" : "production",
    active: Boolean(body.active ?? true),
    retry_enabled: Boolean(body.retry_enabled ?? true),
    retry_attempts: Math.max(1, Math.min(10, Number(body.retry_attempts ?? 3))),
    created_by: current.profile?.id && UUID_PATTERN.test(current.profile.id) ? current.profile.id : null,
    events,
    secret: generateWebhookSecret(),
  };
  const { data, error } = await admin.from("webhook_endpoints").insert(payload).select("id,name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
