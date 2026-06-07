import { NextResponse } from "next/server";

import { requireAdmin, sanitizeText } from "../_lib/marketing-api";

const LEVEL_BY_STATUS: Record<string, "debug" | "info" | "warning" | "error"> = {
  sent: "info",
  delivered: "info",
  enviado: "info",
  entregue: "info",
  queued: "warning",
  pending: "warning",
  processing: "warning",
  canceled: "warning",
  failed: "error",
  error: "error",
  falhou: "error",
};

function normalizeLog(row: any) {
  const details = row.details && typeof row.details === "object" ? row.details : {};
  const event = sanitizeText(details.event) || `communication.${sanitizeText(row.status) || "log"}`;
  const level = sanitizeText(details.level) || LEVEL_BY_STATUS[sanitizeText(row.status)] || "info";
  const message = sanitizeText(details.message) || sanitizeText(row.error_message) || `Registro ${sanitizeText(row.status) || "communication"}`;
  return {
    id: row.id,
    created_at: row.created_at,
    campaign_id: row.campaign_id,
    channel: row.channel,
    event,
    level,
    message,
    payload: details.payload ?? details,
    response: details.response ?? null,
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
    .select("id,created_at,campaign_id,user_id,channel,status,provider_message_id,error_message,details")
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
