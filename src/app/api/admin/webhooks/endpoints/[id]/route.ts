import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const admin = createSupabaseAdminClient();
  const payload: Record<string, unknown> = {};
  if (typeof body.active === "boolean") payload.active = body.active;
  if (Array.isArray(body.events)) payload.events = body.events;
  if (typeof body.name === "string") payload.name = body.name.trim();
  if (typeof body.url === "string") payload.url = body.url.trim();
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
