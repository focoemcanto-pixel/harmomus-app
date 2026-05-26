import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { generateWebhookSecret } from "@/lib/webhooks/core";

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
  if (!current.isAdmin || !current.profile) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const body = await request.json();
  const admin = createSupabaseAdminClient();
  const payload = {
    name: String(body.name ?? "").trim(),
    url: String(body.url ?? "").trim(),
    environment: body.environment === "test" ? "test" : "production",
    active: Boolean(body.active ?? true),
    retry_enabled: Boolean(body.retry_enabled ?? true),
    retry_attempts: Number(body.retry_attempts ?? 3),
    created_by: current.profile.id,
    events: Array.isArray(body.events) ? body.events : [],
    secret: generateWebhookSecret(),
  };
  const { data, error } = await admin.from("webhook_endpoints").insert(payload).select("id,name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
