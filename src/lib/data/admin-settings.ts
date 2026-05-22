import { createClient } from "@/lib/supabase/server";

export interface AdminSettings {
  branding: { appName: string; logoUrl: string; faviconUrl: string; primaryColor: string };
  urls: { appUrl: string; socialLinks: string; courseLink: string };
  payments: { stripeConfigured: boolean; stripePlusPriceId: string; stripePremiumPriceId: string; mode: "test" | "production" };
  storage: { r2Bucket: string; r2PublicUrl: string; connectionStatus: string };
  home: { headline: string; subheadline: string; primaryCta: string; secondaryCta: string };
  whatsapp: { supportPhone: string; webhook: string };
}

const DEFAULT_SETTINGS: AdminSettings = {
  branding: { appName: "Harmomus", logoUrl: "", faviconUrl: "", primaryColor: "#D4AF37" },
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
  home: { headline: "Prepare sua voz. Honre seu chamado.", subheadline: "Kits vocais completos em todos os tons e vozes para preparar seu ministério com excelência, segurança e unidade vocal.", primaryCta: "Explorar kits", secondaryCta: "Experimentar grátis por 7 dias" },
  whatsapp: { supportPhone: "", webhook: "" },
};

function isRecoverableSettingsError(error: unknown) {
  const err = error as { code?: string; message?: string; details?: string } | null;
  const message = `${err?.message ?? ""} ${err?.details ?? ""}`.toLowerCase();

  return (
    err?.code === "42P01" ||
    err?.code === "PGRST205" ||
    (message.includes("admin_settings") &&
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find the table")))
  );
}

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

export async function getAdminSettings(): Promise<AdminSettings> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("admin_settings").select("payload").eq("key", "global").maybeSingle();
  if (error) {
    if (isRecoverableSettingsError(error)) return DEFAULT_SETTINGS;
    console.error("Falha ao carregar configurações", error);
    return DEFAULT_SETTINGS;
  }
  return mergeSettings(data?.payload as Partial<AdminSettings> | null);
}

export async function saveAdminSettings(payload: AdminSettings): Promise<void> {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("admin_settings").upsert({ key: "global", payload, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    if (isRecoverableSettingsError(error)) return;
    throw new Error(`Falha ao salvar configurações: ${error.message}`);
  }
}
