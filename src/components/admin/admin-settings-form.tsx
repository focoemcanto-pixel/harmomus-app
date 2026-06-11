"use client";

import { useState } from "react";

import { BrandingPipelineManager } from "@/components/admin/branding-pipeline-manager";
import type { AdminSettings } from "@/lib/data/admin-settings";

const inputClass = "h-11 rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50";
const labelClass = "grid gap-1.5 text-xs font-medium text-muted";

export function AdminSettingsForm({ settings }: { settings: AdminSettings }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload: AdminSettings = {
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
    };

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Falha ao salvar configurações.");
      setMessage("Configurações salvas com sucesso.");
      window.history.replaceState(null, "", "/admin/configuracoes");
      window.dispatchEvent(new CustomEvent("harmomus:branding-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {message ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-border bg-surface p-3 text-sm shadow-premium sm:p-5">
        <SettingsSection title="Branding" description="Identidade visual, imagens públicas e cor principal.">
          <div className="rounded-2xl border border-border bg-background/45 p-3 sm:p-4">
            <BrandingPipelineManager
              initial={{
                logoUrl: settings.branding.logoUrl,
                faviconUrl: settings.branding.faviconUrl,
                loginImageUrl: settings.branding.loginImageUrl ?? "",
                heroImageUrl: settings.branding.heroImageUrl ?? "",
                ogImageUrl: settings.branding.ogImageUrl ?? "",
              }}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelClass}>Nome do app
              <input name="appName" defaultValue={settings.branding.appName} className={inputClass} placeholder="Nome do app" />
            </label>
            <label className={labelClass}>Cor principal
              <input name="primaryColor" defaultValue={settings.branding.primaryColor} className={inputClass} placeholder="#D4AF37" />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="URLs" description="Links públicos, app e curso.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelClass}>URL do app
              <input name="appUrl" defaultValue={settings.urls.appUrl} className={inputClass} placeholder="NEXT_PUBLIC_APP_URL" />
            </label>
            <label className={labelClass}>Link do curso
              <input name="courseLink" defaultValue={settings.urls.courseLink} className={inputClass} placeholder="Link curso" />
            </label>
            <label className={`${labelClass} md:col-span-2`}>Links sociais
              <input name="socialLinks" defaultValue={settings.urls.socialLinks} className={inputClass} placeholder="Links sociais" />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="Pagamentos" description="Stripe, modo de cobrança e Price IDs.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex h-11 items-center gap-3 rounded-xl border border-border bg-background px-3 text-sm text-muted">
              <input type="checkbox" name="stripeConfigured" defaultChecked={settings.payments.stripeConfigured} />
              Stripe configurado
            </label>
            <label className={labelClass}>Modo
              <select name="mode" defaultValue={settings.payments.mode} className={inputClass}>
                <option value="test">test</option>
                <option value="production">production</option>
              </select>
            </label>
            <label className={labelClass}>Stripe Plus Price ID
              <input name="stripePlusPriceId" defaultValue={settings.payments.stripePlusPriceId} className={inputClass} placeholder="price_..." />
            </label>
            <label className={labelClass}>Stripe Premium Price ID
              <input name="stripePremiumPriceId" defaultValue={settings.payments.stripePremiumPriceId} className={inputClass} placeholder="price_..." />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="Storage" description="Cloudflare R2 e status de conexão.">
          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelClass}>R2 bucket
              <input name="r2Bucket" defaultValue={settings.storage.r2Bucket} className={inputClass} placeholder="R2 bucket" />
            </label>
            <label className={labelClass}>R2 public URL
              <input name="r2PublicUrl" defaultValue={settings.storage.r2PublicUrl} className={inputClass} placeholder="R2 public URL" />
            </label>
            <label className={labelClass}>Status
              <input name="connectionStatus" defaultValue={settings.storage.connectionStatus} className={inputClass} placeholder="Status de conexão" />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="Home" description="Textos principais da página pública.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className={`${labelClass} md:col-span-2`}>Headline
              <input name="headline" defaultValue={settings.home.headline} className={inputClass} placeholder="Headline" />
            </label>
            <label className={`${labelClass} md:col-span-2`}>Subheadline
              <input name="subheadline" defaultValue={settings.home.subheadline} className={inputClass} placeholder="Subheadline" />
            </label>
            <label className={labelClass}>CTA primário
              <input name="primaryCta" defaultValue={settings.home.primaryCta} className={inputClass} placeholder="CTA primário" />
            </label>
            <label className={labelClass}>CTA secundário
              <input name="secondaryCta" defaultValue={settings.home.secondaryCta} className={inputClass} placeholder="CTA secundário" />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="WhatsApp" description="Suporte e webhook reservado.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelClass}>WhatsApp suporte
              <input name="supportPhone" defaultValue={settings.whatsapp.supportPhone} className={inputClass} placeholder="WhatsApp suporte" />
            </label>
            <label className={labelClass}>Webhook reservado
              <input name="webhook" defaultValue={settings.whatsapp.webhook} className={inputClass} placeholder="Webhook reservado" />
            </label>
          </div>
        </SettingsSection>

        <div className="sticky bottom-24 z-10 rounded-2xl border border-gold-500/25 bg-surface/95 p-2 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <button type="submit" disabled={saving} className="w-full rounded-2xl border border-gold-500/30 bg-gold-500/15 px-4 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/25 disabled:opacity-60">
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
      </form>
    </>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/80 bg-background/35 p-3 sm:p-4">
      <div className="mb-3 border-b border-border/70 pb-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
