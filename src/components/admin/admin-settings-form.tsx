"use client";

import { useState } from "react";

import { BrandingPipelineManager } from "@/components/admin/branding-pipeline-manager";
import type { AdminSettings } from "@/lib/data/admin-settings";

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

      <form onSubmit={handleSubmit} className="grid gap-3 rounded-xl border border-border bg-surface p-6 text-sm shadow-premium md:grid-cols-2">
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

        <button type="submit" disabled={saving} className="rounded bg-gold-500/20 px-4 py-2 text-gold-300 transition hover:bg-gold-500/30 disabled:opacity-60 md:col-span-2">
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </form>
    </>
  );
}
