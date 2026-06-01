import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WHATSAPP_PROVIDERS = new Set(["labmessage", "evolution", "zapi", "meta", "custom"] as const);
const EMAIL_PROVIDERS = new Set(["smtp", "resend", "sendgrid", "ses"] as const);
const MASKED_SECRET = "********";

type WhatsAppProvider = "labmessage" | "evolution" | "zapi" | "meta" | "custom";
type EmailProvider = "smtp" | "resend" | "sendgrid" | "ses";
type ChannelType = "whatsapp" | "email";

type SecretStatus = { configured: true };

type WhatsAppConfig = {
  apiUrl?: string;
  apiToken?: string;
  instance?: string;
  testPhone?: string;
};

type EmailConfig = {
  senderName?: string;
  senderEmail?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  testEmail?: string;
};

type MarketingLimits = {
  perMinute: number;
  perHour: number;
  perDay: number;
  delayMin: number;
  delayMax: number;
  pauseEvery: number;
  pauseMinutes: number;
};

type StoredConfig = WhatsAppConfig | EmailConfig;

type MarketingChannelRecord = {
  name: string;
  type: ChannelType;
  provider: WhatsAppProvider | EmailProvider;
  active: boolean;
  config: StoredConfig;
  limits: MarketingLimits;
  created_by: string | null;
  updated_at: string;
};

type MarketingChannelRow = MarketingChannelRecord & {
  id: string;
  created_at?: string;
};

type SafeWhatsAppConfig = Omit<WhatsAppConfig, "apiToken"> & {
  apiToken?: SecretStatus;
};

type SafeEmailConfig = Omit<EmailConfig, "smtpPass"> & {
  smtpPass?: SecretStatus;
};

type SafeMarketingChannelRow = Omit<MarketingChannelRow, "config"> & {
  config: SafeWhatsAppConfig | SafeEmailConfig;
};

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function sanitizeBoolean(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function sanitizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getCreatedBy(profileId?: string | null) {
  return profileId && UUID_PATTERN.test(profileId) ? profileId : null;
}

function getWhatsAppProvider(value: unknown): WhatsAppProvider {
  const provider = sanitizeString(value).toLowerCase();
  return WHATSAPP_PROVIDERS.has(provider as WhatsAppProvider) ? provider as WhatsAppProvider : "labmessage";
}

function getEmailProvider(value: unknown): EmailProvider {
  const provider = sanitizeString(value).toLowerCase();
  return EMAIL_PROVIDERS.has(provider as EmailProvider) ? provider as EmailProvider : "smtp";
}

function addStringIfFilled<T extends Record<string, unknown>>(config: T, key: keyof T, value: unknown) {
  const sanitized = sanitizeString(value);
  if (sanitized) config[key] = sanitized as T[keyof T];
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateConfig(whatsapp: WhatsAppConfig, email: EmailConfig) {
  if (whatsapp.apiUrl && !isValidUrl(whatsapp.apiUrl)) return "URL da API de WhatsApp inválida.";
  if (whatsapp.instance && whatsapp.instance.length < 2) return "Instância do WhatsApp inválida.";
  if (email.senderEmail && !isValidEmail(email.senderEmail)) return "E-mail remetente inválido.";
  if (email.testEmail && !isValidEmail(email.testEmail)) return "E-mail de teste inválido.";
  if (email.smtpHost && email.smtpHost.length < 3) return "Host SMTP inválido.";
  if (email.smtpPort !== undefined && (email.smtpPort < 1 || email.smtpPort > 65535)) return "Porta SMTP inválida.";
  return null;
}

function buildLimits(input: Record<string, unknown>): MarketingLimits {
  return {
    perMinute: sanitizeNumber(input.perMinute, 12),
    perHour: sanitizeNumber(input.perHour, 120),
    perDay: sanitizeNumber(input.perDay, 600),
    delayMin: sanitizeNumber(input.delayMin, 8),
    delayMax: sanitizeNumber(input.delayMax, 25),
    pauseEvery: sanitizeNumber(input.pauseEvery, 80),
    pauseMinutes: sanitizeNumber(input.pauseMinutes, 10),
  };
}

function hasSecret(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildWhatsAppConfig(input: Record<string, unknown>, existing?: WhatsAppConfig): WhatsAppConfig {
  const config: WhatsAppConfig = {};
  addStringIfFilled(config, "apiUrl", input.apiUrl);
  addStringIfFilled(config, "instance", input.instance);
  addStringIfFilled(config, "testPhone", input.testPhone);

  const hasApiTokenInput = Object.hasOwn(input, "apiToken");
  const apiToken = sanitizeString(input.apiToken);
  if (apiToken && apiToken !== MASKED_SECRET) config.apiToken = apiToken;
  else if ((!hasApiTokenInput || apiToken === MASKED_SECRET) && hasSecret(existing?.apiToken)) config.apiToken = existing?.apiToken;

  return config;
}

function buildEmailConfig(input: Record<string, unknown>, existing?: EmailConfig): EmailConfig {
  const config: EmailConfig = {};
  addStringIfFilled(config, "senderName", input.senderName);
  addStringIfFilled(config, "senderEmail", input.senderEmail);
  addStringIfFilled(config, "smtpHost", input.smtpHost);
  addStringIfFilled(config, "smtpUser", input.smtpUser);
  addStringIfFilled(config, "testEmail", input.testEmail);

  const smtpPort = sanitizeString(input.smtpPort);
  if (smtpPort) config.smtpPort = sanitizeNumber(smtpPort, 587);

  const hasSmtpPassInput = Object.hasOwn(input, "smtpPass");
  const smtpPass = sanitizeString(input.smtpPass);
  if (smtpPass && smtpPass !== MASKED_SECRET) config.smtpPass = smtpPass;
  else if ((!hasSmtpPassInput || smtpPass === MASKED_SECRET) && hasSecret(existing?.smtpPass)) config.smtpPass = existing?.smtpPass;

  return config;
}

function isChannelRow(value: unknown): value is MarketingChannelRow {
  const row = sanitizeObject(value);
  return typeof row.id === "string" && (row.type === "whatsapp" || row.type === "email") && typeof row.provider === "string";
}

function normalizeChannelRow(value: unknown): SafeMarketingChannelRow | null {
  if (!isChannelRow(value)) return null;
  return sanitizeChannelForResponse(value);
}

function sanitizeChannelForResponse(channel: MarketingChannelRow): SafeMarketingChannelRow {
  const base = {
    ...channel,
    config: sanitizeConfigForResponse(channel.type, channel.config),
  };
  return base;
}

function sanitizeConfigForResponse(type: ChannelType, config: StoredConfig): SafeWhatsAppConfig | SafeEmailConfig {
  if (type === "whatsapp") {
    const whatsappConfig = config as WhatsAppConfig;
    const safeConfig: SafeWhatsAppConfig = {};
    if (whatsappConfig.apiUrl) safeConfig.apiUrl = whatsappConfig.apiUrl;
    if (whatsappConfig.instance) safeConfig.instance = whatsappConfig.instance;
    if (whatsappConfig.testPhone) safeConfig.testPhone = whatsappConfig.testPhone;
    if (hasSecret(whatsappConfig.apiToken)) safeConfig.apiToken = { configured: true };
    return safeConfig;
  }

  const emailConfig = config as EmailConfig;
  const safeConfig: SafeEmailConfig = {};
  if (emailConfig.senderName) safeConfig.senderName = emailConfig.senderName;
  if (emailConfig.senderEmail) safeConfig.senderEmail = emailConfig.senderEmail;
  if (emailConfig.smtpHost) safeConfig.smtpHost = emailConfig.smtpHost;
  if (emailConfig.smtpPort) safeConfig.smtpPort = emailConfig.smtpPort;
  if (emailConfig.smtpUser) safeConfig.smtpUser = emailConfig.smtpUser;
  if (emailConfig.testEmail) safeConfig.testEmail = emailConfig.testEmail;
  if (hasSecret(emailConfig.smtpPass)) safeConfig.smtpPass = { configured: true };
  return safeConfig;
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
      return NextResponse.json({ error: "Aplique a migration de marketing" }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const channels = (data ?? []).map(normalizeChannelRow).filter((item): item is SafeMarketingChannelRow => item !== null);
  const whatsapp = channels.find((item) => item.type === "whatsapp") ?? null;
  const email = channels.find((item) => item.type === "email") ?? null;

  return NextResponse.json({ data: { whatsapp, email, channels } });
}

export async function POST(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const bodyObject = sanitizeObject(body);
  const whatsapp = sanitizeObject(bodyObject.whatsapp);
  const email = sanitizeObject(bodyObject.email);
  const limits = sanitizeObject(bodyObject.limits);

  const whatsappProvider = getWhatsAppProvider(whatsapp.provider);
  const emailProvider = getEmailProvider(email.provider);
  const safeLimits = buildLimits(limits);

  const createdBy = getCreatedBy(current.profile?.id);
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: existingChannels, error: existingChannelsError } = await admin
    .from("marketing_channels")
    .select("id,created_at,updated_at,name,type,provider,active,config,limits,created_by")
    .in("type", ["whatsapp", "email"]);

  if (existingChannelsError) {
    if (existingChannelsError.code === "42P01") {
      return NextResponse.json({ error: "Aplique a migration de marketing" }, { status: 500 });
    }
    return NextResponse.json({ error: existingChannelsError.message }, { status: 500 });
  }

  const existingRows = (existingChannels ?? []).filter(isChannelRow);
  const existingWhatsapp = existingRows.find((item) => item.type === "whatsapp")?.config as WhatsAppConfig | undefined;
  const existingEmail = existingRows.find((item) => item.type === "email")?.config as EmailConfig | undefined;
  const whatsappConfig = buildWhatsAppConfig(whatsapp, existingWhatsapp);
  const emailConfig = buildEmailConfig(email, existingEmail);
  const validationError = validateConfig(whatsappConfig, emailConfig);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const records: MarketingChannelRecord[] = [
    {
      name: "WhatsApp principal",
      type: "whatsapp",
      provider: whatsappProvider,
      active: sanitizeBoolean(whatsapp.active, true),
      config: whatsappConfig,
      limits: safeLimits,
      created_by: createdBy,
      updated_at: now,
    },
    {
      name: "E-mail principal",
      type: "email",
      provider: emailProvider,
      active: sanitizeBoolean(email.active, true),
      config: emailConfig,
      limits: safeLimits,
      created_by: createdBy,
      updated_at: now,
    },
  ];

  const results: SafeMarketingChannelRow[] = [];
  for (const record of records) {
    const existing = existingRows.find((item) => item.type === record.type);
    const query = existing?.id
      ? admin.from("marketing_channels").update(record).eq("id", existing.id).select("id,name,type,provider,active,config,limits,created_by,updated_at").single()
      : admin.from("marketing_channels").insert(record).select("id,name,type,provider,active,config,limits,created_by,updated_at").single();

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const safeData = normalizeChannelRow(data);
    if (safeData) results.push(safeData);
  }

  return NextResponse.json({ data: results });
}
