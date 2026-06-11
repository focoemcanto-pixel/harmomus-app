import type { MetadataRoute } from "next";

import { getAdminSettings } from "@/lib/data/admin-settings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getAdminSettings();
  const appName = settings.branding.appName || "Harmomus";
  const description = settings.home.subheadline || "Kits vocais premium para equipes de louvor.";
  const startUrl = "/";

  return {
    name: appName,
    short_name: "Harmomus",
    description,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#07080f",
    theme_color: "#07080f",
    orientation: "portrait",
    categories: ["music", "education", "entertainment"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
