import type { Metadata } from "next";

import { GlobalAudioPlayerProvider } from "@/components/public/global-audio-player-provider";
import { getAdminSettings } from "@/lib/data/admin-settings";

import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAdminSettings();
  const appName = settings.branding.appName || "Harmomus";
  const description = settings.home.subheadline || "Kits vocais premium para equipes de louvor.";
  const faviconUrl = settings.branding.faviconUrl || settings.branding.logoUrl || undefined;
  const ogImageUrl = settings.branding.ogImageUrl || settings.branding.heroImageUrl || settings.branding.logoUrl || undefined;
  const appUrl = settings.urls.appUrl || undefined;

  return {
    title: {
      default: appName,
      template: `%s • ${appName}`,
    },
    description,
    metadataBase: appUrl ? new URL(appUrl) : undefined,
    icons: faviconUrl
      ? {
          icon: [{ url: faviconUrl }],
          shortcut: [{ url: faviconUrl }],
          apple: [{ url: faviconUrl }],
        }
      : undefined,
    openGraph: {
      title: appName,
      description,
      type: "website",
      siteName: appName,
      images: ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630, alt: appName }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: appName,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <GlobalAudioPlayerProvider>{children}</GlobalAudioPlayerProvider>
      </body>
    </html>
  );
}
