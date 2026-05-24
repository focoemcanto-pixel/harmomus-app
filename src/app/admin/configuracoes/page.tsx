import { revalidatePath } from "next/cache";
import { BrandingPipelineManager } from "@/components/admin/branding-pipeline-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getAdminSettings, saveAdminSettings } from "@/lib/data/admin-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConfiguracoesPage() {
  const settings = await getAdminSettings();

  async function save(formData: FormData) {
    "use server";

    await saveAdminSettings({
      branding: {
        appName: String(formData.get("appName") ?? ""),
        logoUrl: String(formData.get("logoUrl") ?? ""),
        faviconUrl: String(formData.get("faviconUrl") ?? ""),
        primaryColor: String(formData.get("primaryColor") ?? "#D4AF37"),
        loginImageUrl: String(formData.get("loginImageUrl") ?? ""),
        heroImageUrl: String(formData.get("heroImageUrl") ?? ""),
        ogImageUrl: String(formData.get("ogImageUrl") ?? ""),
      },
      urls: {
        appUrl: String(formData.get("appUrl") ?? ""),
        socialLinks: String(formData.get("socialLinks") ?? ""),
        courseLink: String(formData.get("courseLink") ?? ""),
      },
      payments: {
        stripeConfigured: formData.get("stripeConfigured") === "on",
        stripePlusPriceId: String(formData.get("stripePlusPriceId") ?? ""),
        stripePremiumPriceId: String(formData.get("stripePremiumPriceId") ?? ""),
        mode: String(formData.get("mode") ?? "test") as "test" | "production",
      },
      storage: {
        r2Bucket: String(formData.get("r2Bucket") ?? ""),
        r2PublicUrl: String(formData.get("r2PublicUrl") ?? ""),
        connectionStatus: String(formData.get("connectionStatus") ?? "pendente"),
      },
      home: {
        headline: String(formData.get("headline") ?? ""),
        subheadline: String(formData.get("subheadline") ?? ""),
        primaryCta: String(formData.get("primaryCta") ?? ""),
        secondaryCta: String(formData.get("secondaryCta") ?? ""),
      },
      whatsapp: {
        supportPhone: String(formData.get("supportPhone") ?? ""),
        webhook: String(formData.get("webhook") ?? ""),
      },
    });

    revalidatePath("/admin/configuracoes", "page");
    revalidatePath("/", "page");
    revalidatePath("/login", "page");
    revalidatePath("/cadastro", "page");
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Configurações" description="Central de branding, URLs, pagamentos, storage e home." />

      <form action={save} className="grid gap-3 rounded-xl border border-border bg-surface p-6 text-sm shadow-premium md:grid-cols-2">
        <BrandingPipelineManager
          initial={{
            logoUrl: settings.branding.logoUrl,
            faviconUrl: settings.branding.faviconUrl,
            loginImageUrl: settings.branding.loginImageUrl ?? "",
            heroImageUrl: settings.branding.heroImageUrl ?? "",
            ogImageUrl: settings.branding.ogImageUrl ?? "",
          }}
        />

        <input name="appName" defaultValue={settings.branding.appName} className="rounded border border-border bg-background px-3 py-2" placeholder="Nome do app" />
        <input name="primaryColor" defaultValue={settings.branding.primaryColor} className="rounded border border-border bg-background px-3 py-2" placeholder="Cor principal" />
        <input name="appUrl" defaultValue={settings.urls.appUrl} className="rounded border border-border bg-background px-3 py-2" placeholder="NEXT_PUBLIC_APP_URL" />
        <input name="socialLinks" defaultValue={settings.urls.socialLinks} className="rounded border border-border bg-background px-3 py-2" placeholder="Links sociais" />
        <input name="courseLink" defaultValue={settings.urls.courseLink} className="rounded border border-border bg-background px-3 py-2" placeholder="Link curso" />

        <label className="flex items-center gap-2">
          <input type="checkbox" name="stripeConfigured" defaultChecked={settings.payments.stripeConfigured} />
          Stripe configurado
        </label>

        <input name="stripePlusPriceId" defaultValue={settings.payments.stripePlusPriceId} className="rounded border border-border bg-background px-3 py-2" placeholder="Stripe Plus Price ID" />
        <input name="stripePremiumPriceId" defaultValue={settings.payments.stripePremiumPriceId} className="rounded border border-border bg-background px-3 py-2" placeholder="Stripe Premium Price ID" />

        <select name="mode" defaultValue={settings.payments.mode} className="rounded border border-border bg-background px-3 py-2">
          <option value="test">test</option>
          <option value="production">production</option>
        </select>

        <input name="r2Bucket" defaultValue={settings.storage.r2Bucket} className="rounded border border-border bg-background px-3 py-2" placeholder="R2 bucket" />
        <input name="r2PublicUrl" defaultValue={settings.storage.r2PublicUrl} className="rounded border border-border bg-background px-3 py-2" placeholder="R2 public URL" />
        <input name="connectionStatus" defaultValue={settings.storage.connectionStatus} className="rounded border border-border bg-background px-3 py-2" placeholder="Status de conexão" />
        <input name="headline" defaultValue={settings.home.headline} className="rounded border border-border bg-background px-3 py-2" placeholder="Headline" />
        <input name="subheadline" defaultValue={settings.home.subheadline} className="rounded border border-border bg-background px-3 py-2" placeholder="Subheadline" />
        <input name="primaryCta" defaultValue={settings.home.primaryCta} className="rounded border border-border bg-background px-3 py-2" placeholder="CTA primário" />
        <input name="secondaryCta" defaultValue={settings.home.secondaryCta} className="rounded border border-border bg-background px-3 py-2" placeholder="CTA secundário" />
        <input name="supportPhone" defaultValue={settings.whatsapp.supportPhone} className="rounded border border-border bg-background px-3 py-2" placeholder="WhatsApp suporte" />
        <input name="webhook" defaultValue={settings.whatsapp.webhook} className="rounded border border-border bg-background px-3 py-2" placeholder="Webhook reservado" />

        <button className="rounded bg-gold-500/20 px-4 py-2 text-gold-300 md:col-span-2">
          Salvar configurações
        </button>
      </form>
    </section>
  );
}
