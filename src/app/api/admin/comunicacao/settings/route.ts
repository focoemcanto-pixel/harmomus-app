import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WHATSAPP_PROVIDERS = new Set(["labmessage", "evolution", "zapi", "meta", "custom"]);
const EMAIL_PROVIDERS = new Set(["smtp", "resend", "sendgrid", "ses"]);

function sanitizeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getCreatedBy(profileId?: string | null) {
  return profileId && UUID_PATTERN.test(profileId) ? profileId : null;
}

export async function GET() {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("marketing_channels")
    .select("id,created_at,updated_at,name,type,provider,active,config,limits,created_by")
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({ error: "Banco de marketing ainda não configurado. Aplique a migration." }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const whatsapp = data?.find((item) => item.type === "whatsapp") ?? null;
  const email = data?.find((item) => item.type === "email") ?? null;

  return NextResponse.json({ data: { whatsapp, email, channels: data ?? [] } });
}

export async function POST(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const whatsapp = body.whatsapp ?? {};
  const email = body.email ?? {};
  const limits = body.limits ?? {};

  const whatsappProvider = WHATSAPP_PROVIDERS.has(String(whatsapp.provider)) ? String(whatsapp.provider) : "labmessage";
  const emailProvider = EMAIL_PROVIDERS.has(String(email.provider)) ? String(email.provider) : "smtp";

  const safeLimits = {
    perMinute: sanitizeNumber(limits.perMinute, 12),
    perHour: sanitizeNumber(limits.perHour, 120),
    perDay: sanitizeNumber(limits.perDay, 600),
    delayMin: sanitizeNumber(limits.delayMin, 8),
    delayMax: sanitizeNumber(limits.delayMax, 25),
    pauseEvery: sanitizeNumber(limits.pauseEvery, 80),
    pauseMinutes: sanitizeNumber(limits.pauseMinutes, 10),
  };

  const createdBy = getCreatedBy(current.profile?.id);
  const admin = createSupabaseAdminClient();

  const records = [
    {
      name: "WhatsApp principal",
      type: "whatsapp",
      provider: whatsappProvider,
      active: Boolean(whatsapp.active ?? true),
      config: {
        apiUrl: sanitizeText(whatsapp.apiUrl),
        apiToken: sanitizeText(whatsapp.apiToken),
        instance: sanitizeText(whatsapp.instance),
        testPhone: sanitizeText(whatsapp.testPhone),
      },
      limits: safeLimits,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    },
    {
      name: "E-mail principal",
      type: "email",
      provider: emailProvider,
      active: Boolean(email.active ?? true),
      config: {
        senderName: sanitizeText(email.senderName),
        senderEmail: sanitizeText(email.senderEmail),
        smtpHost: sanitizeText(email.smtpHost),
        smtpPort: sanitizeText(email.smtpPort),
        smtpUser: sanitizeText(email.smtpUser),
        smtpPass: sanitizeText(email.smtpPass),
        testEmail: sanitizeText(email.testEmail),
      },
      limits: safeLimits,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    },
  ];

  const results = [];
  for (const record of records) {
    const { data: existing, error: existingError } = await admin
      .from("marketing_channels")
      .select("id")
      .eq("type", record.type)
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      if (existingError.code === "42P01") {
        return NextResponse.json({ error: "Banco de marketing ainda não configurado. Aplique a migration." }, { status: 500 });
      }
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const query = existing?.id
      ? admin.from("marketing_channels").update(record).eq("id", existing.id).select("id,name,type,provider,active,config,limits").single()
      : admin.from("marketing_channels").insert(record).select("id,name,type,provider,active,config,limits").single();

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    results.push(data);
  }

  return NextResponse.json({ data: results });
}
