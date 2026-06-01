import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const COMMUNICATION_MIGRATION_MESSAGE = "Aplique a migration da Central de Comunicação";

export type MarketingConfig = Record<string, unknown>;

export type MarketingChannel = {
  id: string;
  name?: string | null;
  type: string;
  provider: string;
  active: boolean;
  config: MarketingConfig | null;
  limits?: Record<string, unknown> | null;
};

export function getCreatedBy(profileId?: string | null) {
  return profileId && UUID_PATTERN.test(profileId) ? profileId : null;
}

export function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function sanitizeStringArray(value: unknown, allowed?: Set<string>) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item))
    .filter((item) => item.length > 0)
    .filter((item) => (allowed ? allowed.has(item) : true));
}

export function sanitizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function isMissingMarketingTable(error: { code?: string } | null | undefined) {
  return error?.code === "42P01";
}

export function marketingTableErrorResponse() {
  return NextResponse.json({ error: COMMUNICATION_MIGRATION_MESSAGE }, { status: 500 });
}

export async function requireAdmin() {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) {
    return { current, admin: null, response: NextResponse.json({ error: "Acesso negado" }, { status: 403 }) };
  }

  return { current, admin: createSupabaseAdminClient(), response: null };
}

export function maskSecret(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return "";
  if (text.length <= 6) return "••••";
  return `${text.slice(0, 3)}••••${text.slice(-2)}`;
}

export function safeJson(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

export async function writeMarketingLog(input: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  channel?: string | null;
  event: string;
  level: "debug" | "info" | "warning" | "error";
  message: string;
  payload?: unknown;
  response?: unknown;
}) {
  const { error } = await input.admin.from("communication_logs").insert({
    channel: input.channel ?? null,
    status: input.level === "error" ? "failed" : input.level === "warning" ? "queued" : "sent",
    details: {
      event: input.event,
      level: input.level,
      message: input.message,
      payload: safeJson(input.payload),
      response: safeJson(input.response),
    },
  });

  return error;
}

export async function getActiveChannel(admin: ReturnType<typeof createSupabaseAdminClient>, type: "whatsapp" | "email") {
  const table = type === "whatsapp" ? "communication_whatsapp_integrations" : "communication_email_integrations";
  const result = await admin
    .from(table)
    .select("id,name,provider,active,config,limits")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ...result,
    data: result.data ? ({ ...result.data, type } as MarketingChannel) : null,
  };
}
