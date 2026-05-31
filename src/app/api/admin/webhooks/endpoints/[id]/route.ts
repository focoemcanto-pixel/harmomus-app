import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { WEBHOOK_EVENTS } from "@/types/webhooks";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const admin = createSupabaseAdminClient();
  const payload: Record<string, unknown> = {};
  if (typeof body.active === "boolean") payload.active = body.active;
  if (Array.isArray(body.events)) {
    const events = Array.from(new Set((body.events as unknown[]).filter((event): event is string => typeof event === "string" && WEBHOOK_EVENTS.includes(event))));
    if (events.length === 0) return NextResponse.json({ error: "Selecione ao menos um evento para o webhook." }, { status: 400 });
    payload.events = events;
  }
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
    payload.name = name;
  }
  if (typeof body.url === "string") {
    const url = body.url.trim();
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "URL de webhook inválida." }, { status: 400 });
    }
    payload.url = url;
  }
  if (typeof body.secret === "string") payload.secret = body.secret.trim();
  const { error } = await admin.from("webhook_endpoints").update(payload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: endpoint } = await admin.from("webhook_endpoints").select("id,created_at,updated_at,name,url,environment,active,retry_enabled,retry_attempts,created_by,events,last_triggered_at,secret").eq("id", id).maybeSingle();
  const { data: logs } = await admin.from("webhook_logs").select("*").eq("endpoint_id", id).order("created_at", { ascending: false }).limit(25);
  return NextResponse.json({ data: endpoint, logs: logs ?? [] });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { id } = await params;
  const admin = createSupabaseAdminClient();

  // Primeiro remove logs relacionados para evitar erro de FK em bancos que não usam cascade.
  const logsDelete = await admin.from("webhook_logs").delete().eq("endpoint_id", id);
  if (logsDelete.error) return NextResponse.json({ error: logsDelete.error.message }, { status: 500 });

  const endpointDelete = await admin.from("webhook_endpoints").delete().eq("id", id);
  if (endpointDelete.error) return NextResponse.json({ error: endpointDelete.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
