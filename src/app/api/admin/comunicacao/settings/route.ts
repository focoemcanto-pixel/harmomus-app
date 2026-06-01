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
  tokenConfigured?: true;
};

type SafeEmailConfig = Omit<EmailConfig, "smtpPass"> & {
  passwordConfigured?: true;
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

  const apiToken = sanitizeString(input.apiToken);
  const existingApiToken = existing?.apiToken;
  if (apiToken && apiToken !== MASKED_SECRET) config.apiToken = apiToken;
  else if (hasSecret(existingApiToken)) config.apiToken = existingApiToken;

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

  const smtpPass = sanitizeString(input.smtpPass);
  const existingSmtpPass = existing?.smtpPass;
  if (smtpPass && smtpPass !== MASKED_SECRET) config.smtpPass = smtpPass;
  else if (hasSecret(existingSmtpPass)) config.smtpPass = existingSmtpPass;

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


function integrationTable(type: ChannelType) {
  return type === "whatsapp" ? "communication_whatsapp_integrations" : "communication_email_integrations";
}

function withChannelType(row: unknown, type: ChannelType): unknown {
  return row && typeof row === "object" ? { ...(row as Record<string, unknown>), type } : row;
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
    if (hasSecret(whatsappConfig.apiToken)) safeConfig.tokenConfigured = true;
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
  if (hasSecret(emailConfig.smtpPass)) safeConfig.passwordConfigured = true;
  return safeConfig;
}

export async function GET() {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const [whatsappResult, emailResult] = await Promise.all([
    admin.from(integrationTable("whatsapp")).select("id,created_at,updated_at,name,provider,active,config,limits,created_by").order("created_at", { ascending: false }),
    admin.from(integrationTable("email")).select("id,created_at,updated_at,name,provider,active,config,limits,created_by").order("created_at", { ascending: false }),
  ]);

  if (whatsappResult.error) return NextResponse.json({ error: whatsappResult.error.message }, { status: 500 });
  if (emailResult.error) return NextResponse.json({ error: emailResult.error.message }, { status: 500 });

  const channels = [
    ...(whatsappResult.data ?? []).map((row) => withChannelType(row, "whatsapp")),
    ...(emailResult.data ?? []).map((row) => withChannelType(row, "email")),
  ].map(normalizeChannelRow).filter((item): item is SafeMarketingChannelRow => item !== null);
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

  const [existingWhatsappResult, existingEmailResult] = await Promise.all([
    admin.from(integrationTable("whatsapp")).select("id,created_at,updated_at,name,provider,active,config,limits,created_by"),
    admin.from(integrationTable("email")).select("id,created_at,updated_at,name,provider,active,config,limits,created_by"),
  ]);

  if (existingWhatsappResult.error) return NextResponse.json({ error: existingWhatsappResult.error.message }, { status: 500 });
  if (existingEmailResult.error) return NextResponse.json({ error: existingEmailResult.error.message }, { status: 500 });

  const existingRows = [
    ...(existingWhatsappResult.data ?? []).map((row) => withChannelType(row, "whatsapp")),
    ...(existingEmailResult.data ?? []).map((row) => withChannelType(row, "email")),
  ].filter(isChannelRow);
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
    const { type, ...dbRecord } = record;
    const query = existing?.id
      ? admin.from(integrationTable(type)).update(dbRecord).eq("id", existing.id).select("id,name,provider,active,config,limits,created_by,updated_at").single()
      : admin.from(integrationTable(type)).insert(dbRecord).select("id,name,provider,active,config,limits,created_by,updated_at").single();

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const safeData = normalizeChannelRow(withChannelType(data, type));
    if (safeData) results.push(safeData);
  }

  return NextResponse.json({ data: results });
}
