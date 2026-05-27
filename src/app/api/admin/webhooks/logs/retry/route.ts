import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const logId = String(body?.logId ?? "");
  const admin = createSupabaseAdminClient();
  const { data: log } = await admin.from("webhook_logs").select("endpoint_id,event").eq("id", logId).maybeSingle();
  if (!log) return NextResponse.json({ error: "Log não encontrado" }, { status: 404 });
  const res = await fetch(new URL("/api/admin/webhooks/test", request.url), { method: "POST", headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" }, body: JSON.stringify({ endpointId: log.endpoint_id, event: log.event }) });
  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}
