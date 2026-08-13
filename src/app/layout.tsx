import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AttributionCapture } from "@/components/analytics/attribution-capture";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { FlashToastProvider } from "@/components/feedback/flash-toast-provider";
import { PhoneRequiredModal } from "@/components/profile/phone-required-modal";
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
    icons: {
      icon: [
        {
          url: "/favicon-32x32.png",
          sizes: "32x32",
          type: "image/png",
        },
        {
          url: "/favicon-16x16.png",
          sizes: "16x16",
          type: "image/png",
        },
        {
          url: "/favicon.ico",
        },
      ],
      apple: [
        {
          url: "/apple-touch-icon.png",
          sizes: "180x180",
          type: "image/png",
        },
      ],
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
        <Script id="whatsapp-number-normalizer" strategy="afterInteractive">
          {`
            (function () {
              var phone = '5571996125869';
              function normalize(anchor) {
                if (!anchor || !anchor.href) return;
                try {
                  var url = new URL(anchor.href, window.location.href);
                  if (url.hostname === 'wa.me') {
                    url.pathname = '/' + phone;
                    anchor.href = url.toString();
                    return;
                  }
                  if (url.hostname === 'api.whatsapp.com' && url.pathname.indexOf('/send') === 0) {
                    url.searchParams.set('phone', phone);
                    anchor.href = url.toString();
                  }
                } catch (_) {}
              }
              function normalizeAll() {
                document.querySelectorAll('a[href*="wa.me/"],a[href*="api.whatsapp.com/send"]').forEach(normalize);
              }
              normalizeAll();
              new MutationObserver(normalizeAll).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
              document.addEventListener('click', function (event) {
                var target = event.target && event.target.closest ? event.target.closest('a') : null;
                normalize(target);
              }, true);
            })();
          `}
        </Script>
        <PhoneRequiredModal />
        <FlashToastProvider />
      </body>
    </html>
  );
}
