import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { r2BucketName, r2Client } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AdminSettings {
  branding: {
    appName: string;
    logoUrl: string;
    faviconUrl: string;
    primaryColor: string;
    loginImageUrl?: string;
    heroImageUrl?: string;
    ogImageUrl?: string;
  };
  urls: { appUrl: string; socialLinks: string; courseLink: string };
  payments: { stripeConfigured: boolean; stripePlusPriceId: string; stripePremiumPriceId: string; mode: "test" | "production" };
  storage: { r2Bucket: string; r2PublicUrl: string; connectionStatus: string };
  home: { headline: string; subheadline: string; primaryCta: string; secondaryCta: string };
  whatsapp: { supportPhone: string; webhook: string };
}

const SETTINGS_TYPE = "admin_settings_global";
const SETTINGS_TITLE = "Configurações Harmomus";
const SETTINGS_R2_KEY = "settings/admin-settings.json";

const DEFAULT_SETTINGS: AdminSettings = {
  branding: {
    appName: "Harmomus",
    logoUrl: "",
    faviconUrl: "",
    primaryColor: "#D4AF37",
    loginImageUrl: "",
    heroImageUrl: "",
    ogImageUrl: "",
  },
  urls: { appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "", socialLinks: "", courseLink: "https://harmonia.focoemcanto.com" },
  payments: {
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripePlusPriceId: process.env.STRIPE_PLUS_PRICE_ID ?? "",
    stripePremiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID ?? "",
    mode: process.env.STRIPE_LIVE_MODE === "true" ? "production" : "test",
  },
  storage: {
    r2Bucket: process.env.R2_BUCKET_NAME ?? "",
    r2PublicUrl: process.env.R2_PUBLIC_BASE_URL ?? "",
    connectionStatus: process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID ? "conectado" : "pendente",
  },
  home: {
    headline: "Prepare sua voz. Honre seu chamado.",
    subheadline: "Kits vocais completos em todos os tons e vozes para preparar seu ministério com excelência, segurança e unidade vocal.",
    primaryCta: "Explorar kits",
    secondaryCta: "Experimentar grátis por 7 dias",
  },
  whatsapp: { supportPhone: "", webhook: "" },
};

function mergeSettings(payload: Partial<AdminSettings> | null | undefined): AdminSettings {
  return {
    branding: { ...DEFAULT_SETTINGS.branding, ...(payload?.branding ?? {}) },
    urls: { ...DEFAULT_SETTINGS.urls, ...(payload?.urls ?? {}) },
    payments: { ...DEFAULT_SETTINGS.payments, ...(payload?.payments ?? {}) },
    storage: { ...DEFAULT_SETTINGS.storage, ...(payload?.storage ?? {}) },
    home: { ...DEFAULT_SETTINGS.home, ...(payload?.home ?? {}) },
    whatsapp: { ...DEFAULT_SETTINGS.whatsapp, ...(payload?.whatsapp ?? {}) },
  };
}

function parsePayload(raw: unknown): Partial<AdminSettings> | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as Partial<AdminSettings>;
  } catch {
    return null;
  }
}

function settingsRow(payload: AdminSettings) {
  return {
    type: SETTINGS_TYPE,
    title: SETTINGS_TITLE,
    subtitle: JSON.stringify(mergeSettings(payload)),
    active: true,
    order_index: -999,
  };
}

function isMissingHomeSectionsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("public.home_sections") || message.includes("home_sections") || message.includes("schema cache");
}

async function bodyToString(body: any): Promise<string> {
  if (!body) return "";
  if (typeof body.transformToString === "function") return body.transformToString();
  if (typeof body.text === "function") return body.text();

  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8");
}

async function getSettingsFromR2(): Promise<AdminSettings | null> {
  if (!r2BucketName) return null;

  try {
    const response = await r2Client.send(new GetObjectCommand({ Bucket: r2BucketName, Key: SETTINGS_R2_KEY }));
    const raw = await bodyToString(response.Body);
    return mergeSettings(parsePayload(raw));
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name !== "NoSuchKey" && name !== "NotFound") {
      console.error("Falha ao carregar configurações do R2", error);
    }
    return null;
  }
}

async function saveSettingsToR2(payload: AdminSettings): Promise<void> {
  if (!r2BucketName) throw new Error("R2_BUCKET_NAME não configurado para salvar configurações.");

  await r2Client.send(new PutObjectCommand({
    Bucket: r2BucketName,
    Key: SETTINGS_R2_KEY,
    Body: JSON.stringify(mergeSettings(payload), null, 2),
    ContentType: "application/json; charset=utf-8",
    CacheControl: "private, max-age=0, no-store",
  }));
}

async function getSettingsFromDatabase(): Promise<AdminSettings | null> {
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("home_sections")
    .select("subtitle")
    .eq("type", SETTINGS_TYPE)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`select: ${error.message}`);
  return mergeSettings(parsePayload(data?.[0]?.subtitle));
}

async function saveSettingsToDatabase(payload: AdminSettings): Promise<void> {
  const supabase = createSupabaseAdminClient() as any;
  const row = settingsRow(payload);

  const { data: existing, error: existingError } = await supabase
    .from("home_sections")
    .select("id")
    .eq("type", SETTINGS_TYPE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`select: ${existingError.message}`);
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("home_sections")
      .update(row)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`update: ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await supabase.from("home_sections").insert(row);
  if (insertError) {
    throw new Error(`insert: ${insertError.message}`);
  }
}

export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    return (await getSettingsFromDatabase()) ?? DEFAULT_SETTINGS;
  } catch (error) {
    if (!isMissingHomeSectionsError(error)) {
      console.error("Falha ao carregar configurações", error);
    }
  }

  const r2Settings = await getSettingsFromR2();
  return r2Settings ?? DEFAULT_SETTINGS;
}

export async function saveAdminSettings(payload: AdminSettings): Promise<void> {
  try {
    await saveSettingsToDatabase(payload);
    await saveSettingsToR2(payload);
    return;
  } catch (databaseError) {
    if (!isMissingHomeSectionsError(databaseError)) {
      console.error("Falha ao salvar configurações no banco. Usando fallback R2.", databaseError);
    }
  }

  await saveSettingsToR2(payload);
}

export async function updateBrandingSettings(branding: Partial<AdminSettings["branding"]>): Promise<AdminSettings> {
  const current = await getAdminSettings();
  const next = mergeSettings({ ...current, branding: { ...current.branding, ...branding } });
  await saveAdminSettings(next);
  return next;
}
