import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

const MAX_LIMIT = 250;

function clampLimit(value: string | null) {
  const parsed = Number(value ?? 150);
  if (!Number.isFinite(parsed)) return 150;
  return Math.min(MAX_LIMIT, Math.max(10, Math.round(parsed)));
}

export async function GET(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const success = searchParams.get("success");
  const event = String(searchParams.get("event") ?? "").trim();
  const endpoint = String(searchParams.get("endpoint") ?? "").trim();
  const q = String(searchParams.get("q") ?? "").trim();
  const limit = clampLimit(searchParams.get("limit"));

  const admin = createSupabaseAdminClient() as any;
  let query = admin
    .from("webhook_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (success === "true" || success === "false") query = query.eq("success", success === "true");
  if (event) query = query.eq("event", event);
  if (endpoint) query = query.eq("endpoint_id", endpoint);
  if (q) {
    const normalized = q.replace(/[%_,()]/g, "");
    query = query.or([
      `event.ilike.%${normalized}%`,
      `delivery_id.ilike.%${normalized}%`,
      `error_message.ilike.%${normalized}%`,
      `request_body->>email.ilike.%${normalized}%`,
      `request_body->>phone.ilike.%${normalized}%`,
      `request_body->recipient->>email.ilike.%${normalized}%`,
      `request_body->recipient->>phone.ilike.%${normalized}%`,
      `request_body->customer->>email.ilike.%${normalized}%`,
      `request_body->customer->>phone.ilike.%${normalized}%`,
    ].join(","));
  }

  const [{ data, error, count }, { data: endpoints, error: endpointError }] = await Promise.all([
    query,
    admin.from("webhook_endpoints").select("id,name,events,active,url,last_triggered_at"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (endpointError) return NextResponse.json({ error: endpointError.message }, { status: 500 });

  const endpointMap = new Map((endpoints ?? []).map((item: any) => [item.id, item]));
  const enriched = (data ?? []).map((log: any) => ({
    ...log,
    endpoint: endpointMap.get(log.endpoint_id) ?? null,
  }));

  const summary = enriched.reduce(
    (acc: { total: number; success: number; failed: number; status0: number; avgMs: number }, log: any) => {
      acc.total += 1;
      if (log.success) acc.success += 1;
      else acc.failed += 1;
      if (Number(log.status ?? 0) === 0) acc.status0 += 1;
      acc.avgMs += Number(log.duration_ms ?? 0);
      return acc;
    },
    { total: 0, success: 0, failed: 0, status0: 0, avgMs: 0 },
  );
  summary.avgMs = summary.total ? Math.round(summary.avgMs / summary.total) : 0;

  return NextResponse.json({ data: enriched, endpoints: endpoints ?? [], count: count ?? 0, summary });
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
