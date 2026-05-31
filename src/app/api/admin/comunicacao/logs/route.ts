import { NextResponse } from "next/server";

import { isMissingMarketingTable, marketingTableErrorResponse, requireAdmin } from "../_lib/marketing-api";

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { data, error } = await admin
    .from("marketing_logs")
    .select("id,created_at,campaign_id,job_id,channel,event,level,message,payload,response")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingMarketingTable(error)) return marketingTableErrorResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
