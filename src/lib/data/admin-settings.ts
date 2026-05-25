import { createClient } from "@/lib/supabase/server";

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

export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    const supabase = (await createClient()) as any;

    const { data, error } = await supabase
      .from("home_sections")
      .select("subtitle")
      .eq("type", SETTINGS_TYPE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Falha ao carregar configurações", error);
      return DEFAULT_SETTINGS;
    }

    return mergeSettings(parsePayload(data?.subtitle));
  } catch (error) {
    console.error("Erro inesperado ao carregar configurações", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveAdminSettings(payload: AdminSettings): Promise<void> {
  const supabase = (await createClient()) as any;
  const serialized = JSON.stringify(mergeSettings(payload));

  const { data: existing, error: existingError } = await supabase
    .from("home_sections")
    .select("id")
    .eq("type", SETTINGS_TYPE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("home_sections")
      .update({
        title: "Configurações Harmomus",
        subtitle: serialized,
        active: true,
        order_index: -999,
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("home_sections").insert({
    type: SETTINGS_TYPE,
    title: "Configurações Harmomus",
    subtitle: serialized,
    active: true,
    order_index: -999,
  });

  if (error) throw new Error(error.message);
}

export async function updateBrandingSettings(branding: Partial<AdminSettings["branding"]>): Promise<AdminSettings> {
  const current = await getAdminSettings();
  const next = mergeSettings({ ...current, branding: { ...current.branding, ...branding } });
  await saveAdminSettings(next);
  return next;
}
