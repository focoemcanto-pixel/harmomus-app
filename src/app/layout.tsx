import type { Metadata, Viewport } from "next";
import { AttributionCapture } from "@/components/analytics/attribution-capture";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { FlashToastProvider } from "@/components/feedback/flash-toast-provider";
import { getAdminSettings } from "@/lib/data/admin-settings";
import "./globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function withVersion(url: string | undefined) {
  if (!url) return undefined;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${Date.now()}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAdminSettings();
  const appName = settings.branding.appName || "Harmomus";
  const description = settings.home.subheadline || "Kits vocais premium para equipes de louvor.";
  const faviconUrl = withVersion(settings.branding.faviconUrl || settings.branding.logoUrl || undefined);
  const ogImageUrl = withVersion(settings.branding.ogImageUrl || settings.branding.heroImageUrl || settings.branding.logoUrl || undefined);
  const appUrl = settings.urls.appUrl || process.env.NEXT_PUBLIC_APP_URL || undefined;

  return {
    title: { default: appName, template: `%s • ${appName}` },
    description,
    applicationName: appName,
    metadataBase: appUrl ? new URL(appUrl) : undefined,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: appName,
      statusBarStyle: "black-translucent",
    },
    formatDetection: {
      telephone: false,
    },
    icons: faviconUrl
      ? {
          icon: [{ url: faviconUrl, type: "image/png" }],
          shortcut: [{ url: faviconUrl }],
          apple: [{ url: faviconUrl }],
        }
      : {
          icon: [{ url: "/favicon.ico" }],
          shortcut: [{ url: "/favicon.ico" }],
          apple: [{ url: "/favicon.ico" }],
        },
    openGraph: {
      title: appName,
      description,
      type: "website",
      siteName: appName,
      locale: "pt_BR",
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

export const viewport: Viewport = {
  themeColor: "#07080f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AttributionCapture />
        <MetaPixel />
        {children}
        <FlashToastProvider />
      </body>
    </html>
  );
}
