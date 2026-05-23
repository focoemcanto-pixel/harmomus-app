import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/admin/page-header";
import { getAdminSettings, saveAdminSettings } from "@/lib/data/admin-settings";
import { uploadKitCoverToR2 } from "@/lib/r2/upload";

export default async function ConfiguracoesPage() {
  const settings = await getAdminSettings();

  async function save(formData: FormData) {
    "use server";
    let logoUrl = String(formData.get("logoUrl") ?? "").trim();
    const logoFile = formData.get("logoFile");
    if (logoFile instanceof File && logoFile.size > 0) {
      const uploaded = await uploadKitCoverToR2({ file: logoFile, slug: "harmomus-logo-oficial", context: "banner" });
      logoUrl = `${uploaded.url}${uploaded.url.includes("?") ? "&" : "?"}v=${Date.now()}`;
    }
    await saveAdminSettings({
      branding: { appName: String(formData.get("appName") ?? ""), logoUrl, faviconUrl: String(formData.get("faviconUrl") ?? ""), primaryColor: String(formData.get("primaryColor") ?? "#D4AF37") },
      urls: { appUrl: String(formData.get("appUrl") ?? ""), socialLinks: String(formData.get("socialLinks") ?? ""), courseLink: String(formData.get("courseLink") ?? "") },
      payments: { stripeConfigured: formData.get("stripeConfigured") === "on", stripePlusPriceId: String(formData.get("stripePlusPriceId") ?? ""), stripePremiumPriceId: String(formData.get("stripePremiumPriceId") ?? ""), mode: String(formData.get("mode") ?? "test") as "test" | "production" },
      storage: { r2Bucket: String(formData.get("r2Bucket") ?? ""), r2PublicUrl: String(formData.get("r2PublicUrl") ?? ""), connectionStatus: String(formData.get("connectionStatus") ?? "pendente") },
      home: { headline: String(formData.get("headline") ?? ""), subheadline: String(formData.get("subheadline") ?? ""), primaryCta: String(formData.get("primaryCta") ?? ""), secondaryCta: String(formData.get("secondaryCta") ?? "") },
      whatsapp: { supportPhone: String(formData.get("supportPhone") ?? ""), webhook: String(formData.get("webhook") ?? "") },
    });
    revalidatePath("/admin/configuracoes");
    revalidatePath("/");
    revalidatePath("/login");
    revalidatePath("/cadastro");
  }

  return <section className="space-y-6"><PageHeader title="Configurações" description="Central de branding, URLs, pagamentos, storage e home." />
  <form action={save} className="rounded-xl border border-border bg-surface p-6 shadow-premium grid gap-3 md:grid-cols-2 text-sm">
    <div className="md:col-span-2 rounded-2xl border border-border bg-background/60 p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-300">Logo oficial</p>
      <p className="mt-1 text-sm text-muted">Suba a marca oficial do Harmomus. Ela será usada no topo do site, login e cadastro.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[240px_1fr] md:items-center">
        <div className="flex h-24 items-center justify-center rounded-2xl border border-border bg-black/40 p-4">
          {settings.branding.logoUrl ? <img src={settings.branding.logoUrl} alt="Logo Harmomus" className="max-h-16 max-w-full object-contain" /> : <span className="text-muted">Sem logo</span>}
        </div>
        <div className="space-y-3">
          <input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp" className="block w-full rounded border border-border bg-background px-3 py-2 text-white" />
          <input name="logoUrl" defaultValue={settings.branding.logoUrl} className="w-full rounded border border-border bg-background px-3 py-2" placeholder="ou cole a URL da logo" />
        </div>
      </div>
    </div>
    <input name="appName" defaultValue={settings.branding.appName} className="rounded border border-border bg-background px-3 py-2" placeholder="Nome do app" />
    <input name="faviconUrl" defaultValue={settings.branding.faviconUrl} className="rounded border border-border bg-background px-3 py-2" placeholder="Favicon URL" />
    <input name="primaryColor" defaultValue={settings.branding.primaryColor} className="rounded border border-border bg-background px-3 py-2" placeholder="Cor principal" />
    <input name="appUrl" defaultValue={settings.urls.appUrl} className="rounded border border-border bg-background px-3 py-2" placeholder="NEXT_PUBLIC_APP_URL" />
    <input name="socialLinks" defaultValue={settings.urls.socialLinks} className="rounded border border-border bg-background px-3 py-2" placeholder="Links sociais" />
    <input name="courseLink" defaultValue={settings.urls.courseLink} className="rounded border border-border bg-background px-3 py-2" placeholder="Link curso" />
    <label className="flex items-center gap-2"><input type="checkbox" name="stripeConfigured" defaultChecked={settings.payments.stripeConfigured} /> Stripe configurado</label>
    <input name="stripePlusPriceId" defaultValue={settings.payments.stripePlusPriceId} className="rounded border border-border bg-background px-3 py-2" placeholder="Stripe Plus Price ID" />
    <input name="stripePremiumPriceId" defaultValue={settings.payments.stripePremiumPriceId} className="rounded border border-border bg-background px-3 py-2" placeholder="Stripe Premium Price ID" />
    <select name="mode" defaultValue={settings.payments.mode} className="rounded border border-border bg-background px-3 py-2"><option value="test">test</option><option value="production">production</option></select>
    <input name="r2Bucket" defaultValue={settings.storage.r2Bucket} className="rounded border border-border bg-background px-3 py-2" placeholder="R2 bucket" />
    <input name="r2PublicUrl" defaultValue={settings.storage.r2PublicUrl} className="rounded border border-border bg-background px-3 py-2" placeholder="R2 public URL" />
    <input name="connectionStatus" defaultValue={settings.storage.connectionStatus} className="rounded border border-border bg-background px-3 py-2" placeholder="Status de conexão" />
    <input name="headline" defaultValue={settings.home.headline} className="rounded border border-border bg-background px-3 py-2" placeholder="Headline" />
    <input name="subheadline" defaultValue={settings.home.subheadline} className="rounded border border-border bg-background px-3 py-2" placeholder="Subheadline" />
    <input name="primaryCta" defaultValue={settings.home.primaryCta} className="rounded border border-border bg-background px-3 py-2" placeholder="CTA primário" />
    <input name="secondaryCta" defaultValue={settings.home.secondaryCta} className="rounded border border-border bg-background px-3 py-2" placeholder="CTA secundário" />
    <input name="supportPhone" defaultValue={settings.whatsapp.supportPhone} className="rounded border border-border bg-background px-3 py-2" placeholder="WhatsApp suporte" />
    <input name="webhook" defaultValue={settings.whatsapp.webhook} className="rounded border border-border bg-background px-3 py-2" placeholder="Webhook reservado" />
    <button className="md:col-span-2 rounded bg-gold-500/20 px-4 py-2 text-gold-300">Salvar configurações</button>
  </form></section>;
}
