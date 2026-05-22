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
  urls: { appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "", socialLinks: "", courseLink: "" },
  payments: { stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY), stripePlusPriceId: process.env.STRIPE_PLUS_PRICE_ID ?? "", stripePremiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID ?? "", mode: process.env.STRIPE_LIVE_MODE === "true" ? "production" : "test" },
  storage: { r2Bucket: process.env.R2_BUCKET_NAME ?? "", r2PublicUrl: process.env.R2_PUBLIC_BASE_URL ?? "", connectionStatus: process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID ? "conectado" : "pendente" },
  home: { headline: "", subheadline: "", primaryCta: "", secondaryCta: "" },
  whatsapp: { supportPhone: "", webhook: "" },
};

function missingTable(error: unknown) {
  const err = error as { code?: string };
  return err?.code === "42P01";
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("admin_settings").select("payload").eq("key", "global").maybeSingle();
  if (error) {
    if (missingTable(error)) return DEFAULT_SETTINGS;
    throw new Error(`Falha ao carregar configurações: ${error.message}`);
  }
  return { ...DEFAULT_SETTINGS, ...(data?.payload ?? {}) };
}

export async function saveAdminSettings(payload: AdminSettings): Promise<void> {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("admin_settings").upsert({ key: "global", payload, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    if (missingTable(error)) return;
    throw new Error(`Falha ao salvar configurações: ${error.message}`);
  }
}
