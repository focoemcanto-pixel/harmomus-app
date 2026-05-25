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

const FALLBACK_SECTION_TYPE = "admin_settings_global";
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
  home: { headline: "Prepare sua voz. Honre seu chamado.", subheadline: "Kits vocais completos em todos os tons e vozes para preparar seu ministério com excelência, segurança e unidade vocal.", primaryCta: "Explorar kits", secondaryCta: "Experimentar grátis por 7 dias" },
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

function parseFallbackPayload(raw: unknown): Partial<AdminSettings> | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as Partial<AdminSettings>;
  } catch {
    return null;
  }
}

function hasUsefulPayload(payload: Partial<AdminSettings> | null | undefined) {
  return Boolean(
    payload?.branding?.logoUrl ||
      payload?.branding?.faviconUrl ||
      payload?.branding?.loginImageUrl ||
      payload?.branding?.heroImageUrl ||
      payload?.branding?.ogImageUrl ||
      payload?.branding?.appName,
  );
}

async function getFallbackPayload(supabase: any): Promise<Partial<AdminSettings> | null> {
  try {
    const { data, error } = await supabase
      .from("home_sections")
      .select("subtitle")
      .eq("type", FALLBACK_SECTION_TYPE)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Falha ao carregar configurações fallback", error);
      return null;
    }

    return parseFallbackPayload(data?.subtitle);
  } catch (error) {
    console.error("Erro inesperado ao carregar configurações fallback", error);
    return null;
  }
}

async function saveFallbackSettings(supabase: any, payload: AdminSettings): Promise<boolean> {
  try {
    const serialized = JSON.stringify(payload);
    const { data: existing } = await supabase
      .from("home_sections")
      .select("id")
      .eq("type", FALLBACK_SECTION_TYPE)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("home_sections")
        .update({ title: "Admin Settings", subtitle: serialized, active: false, order_index: -999 })
        .eq("id", existing.id);
      if (error) {
        console.error("Falha ao atualizar configurações fallback", error);
        return false;
      }
      return true;
    }

    const { error } = await supabase.from("home_sections").insert({
      type: FALLBACK_SECTION_TYPE,
      title: "Admin Settings",
      subtitle: serialized,
      active: false,
      order_index: -999,
    });

    if (error) {
      console.error("Falha ao criar configurações fallback", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Erro inesperado ao salvar configurações fallback", error);
    return false;
  }
}

export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    const supabase = createSupabaseAdminClient() as any;
    const [{ data, error }, fallbackPayload] = await Promise.all([
      supabase.from("admin_settings").select("payload").eq("key", "global").maybeSingle(),
      getFallbackPayload(supabase),
    ]);

    if (error) {
      console.error("Falha ao carregar admin_settings, usando fallback", error);
      return mergeSettings(fallbackPayload);
    }

    const primaryPayload = data?.payload as Partial<AdminSettings> | null;
    if (hasUsefulPayload(primaryPayload)) return mergeSettings(primaryPayload);
    if (hasUsefulPayload(fallbackPayload)) return mergeSettings(fallbackPayload);
    return mergeSettings(primaryPayload ?? fallbackPayload);
  } catch (error) {
    console.error("Erro inesperado ao carregar configurações", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveAdminSettings(payload: AdminSettings): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient() as any;
    const [{ error }, savedFallback] = await Promise.all([
      supabase.from("admin_settings").upsert({ key: "global", payload, updated_at: new Date().toISOString() }, { onConflict: "key" }),
      saveFallbackSettings(supabase, payload),
    ]);

    if (error) console.error("Falha ao salvar admin_settings", error);
    if (error && !savedFallback) throw new Error(error.message || "Falha ao salvar configurações.");
  } catch (error) {
    console.error("Erro inesperado ao salvar configurações", error);
    throw error;
  }
}

export async function updateBrandingSettings(branding: Partial<AdminSettings["branding"]>): Promise<AdminSettings> {
  const current = await getAdminSettings();
  const next = mergeSettings({ ...current, branding: { ...current.branding, ...branding } });
  await saveAdminSettings(next);
  return next;
}
