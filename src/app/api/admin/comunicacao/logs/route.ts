import { NextResponse } from "next/server";

import { isMissingCommunicationTable, communicationTableErrorResponse, requireAdmin, sanitizeText } from "../_lib/marketing-api";

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const url = new URL(request.url);
  const channel = sanitizeText(url.searchParams.get("channel"));
  const level = sanitizeText(url.searchParams.get("status"));
  const search = sanitizeText(url.searchParams.get("q"));

  let query = admin
    .from("communication_logs")
    .select("id,created_at,campaign_id,user_id,channel,status,provider_message_id,details")
    .order("created_at", { ascending: false })
    .limit(100);

  if (channel) query = query.eq("channel", channel);
  if (level) query = query.eq("status", level);
  if (search) query = query.or(`status.ilike.%${search}%`);

  const { data, error } = await query;

  if (error) {
    if (isMissingCommunicationTable(error)) return communicationTableErrorResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: (data ?? []).map((row: any) => ({ ...row, event: row.details?.event_key ?? row.status, level: row.details?.level ?? row.status, message: row.details?.message ?? row.status, payload: row.details?.payload ?? row.details ?? {}, response: row.details?.response ?? null })) });
}
