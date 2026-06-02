import { NextResponse } from "next/server";

import { requireAdmin, sanitizeText } from "../_lib/marketing-api";

function normalizeLog(row: any) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const event = sanitizeText(row.event) || "communication.log";
  const level = sanitizeText(row.level) || "info";
  const message = sanitizeText(row.message) || `Registro ${event}`;
  return {
    id: row.id,
    created_at: row.created_at,
    campaign_id: row.campaign_id,
    channel: row.channel,
    event,
    level,
    message,
    payload,
    response: row.response ?? null,
  };
}

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const url = new URL(request.url);
  const channel = sanitizeText(url.searchParams.get("channel"));
  const level = sanitizeText(url.searchParams.get("status"));
  const search = sanitizeText(url.searchParams.get("q")).toLowerCase();

  let query = admin
    .from("communication_logs")
    .select("id,created_at,campaign_id,job_id,channel,event,level,message,payload,response")
    .order("created_at", { ascending: false })
    .limit(100);

  if (channel) query = query.eq("channel", channel);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const logs = (data ?? []).map(normalizeLog).filter((log) => {
    if (level && log.level !== level) return false;
    if (!search) return true;
    return `${log.message} ${log.event} ${log.channel ?? ""}`.toLowerCase().includes(search);
  });

  return NextResponse.json({ data: logs });
}
