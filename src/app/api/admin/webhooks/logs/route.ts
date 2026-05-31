import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export async function GET(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const success = searchParams.get("success");
  const event = searchParams.get("event");
  const endpoint = searchParams.get("endpoint");

  const admin = createSupabaseAdminClient();
  let query = admin.from("webhook_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).limit(150);
  if (success === "true" || success === "false") query = query.eq("success", success === "true");
  if (event) query = query.eq("event", event);
  if (endpoint) query = query.eq("endpoint_id", endpoint);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}

export async function DELETE(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const endpoint = searchParams.get("endpoint");
  const olderThanDays = Number(searchParams.get("older_than_days") ?? 0);
  const confirm = searchParams.get("confirm") === "true";

  if (!confirm) {
    return NextResponse.json({ error: "Confirmação obrigatória para limpar logs." }, { status: 400 });
  }

  const allowedScopes = new Set(["tests", "failed", "endpoint", "old"]);
  if (!scope || !allowedScopes.has(scope)) {
    return NextResponse.json({ error: "Escopo inválido para limpeza de logs." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let query = admin.from("webhook_logs").delete({ count: "exact" });

  if (scope === "tests") {
    query = query.eq("request_body->>test", "true");
  }

  if (scope === "failed") {
    query = query.eq("success", false);
  }

  if (scope === "endpoint") {
    if (!endpoint) return NextResponse.json({ error: "Informe o endpoint para limpar logs desta integração." }, { status: 400 });
    query = query.eq("endpoint_id", endpoint);
  }

  if (scope === "old") {
    if (!Number.isFinite(olderThanDays) || olderThanDays < 7) {
      return NextResponse.json({ error: "Use no mínimo 7 dias para limpar logs antigos." }, { status: 400 });
    }
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.lt("created_at", cutoff);
  }

  const { error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: count ?? 0, scope });
}
