import { NextResponse } from "next/server";

import { isMissingMarketingTable, marketingTableErrorResponse, requireAdmin, sanitizeText } from "../_lib/marketing-api";

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const url = new URL(request.url);
  const channel = sanitizeText(url.searchParams.get("channel"));
  const level = sanitizeText(url.searchParams.get("status"));
  const search = sanitizeText(url.searchParams.get("q"));

  let query = admin
    .from("marketing_logs")
    .select("id,created_at,campaign_id,job_id,channel,event,level,message,payload,response")
    .order("created_at", { ascending: false })
    .limit(100);

  if (channel) query = query.eq("channel", channel);
  if (level) query = query.eq("level", level);
  if (search) query = query.or(`message.ilike.%${search}%,event.ilike.%${search}%`);

  const { data, error } = await query;

  if (error) {
    if (isMissingMarketingTable(error)) return marketingTableErrorResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
