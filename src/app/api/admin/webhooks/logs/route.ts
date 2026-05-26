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
