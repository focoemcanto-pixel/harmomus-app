import type { MetadataRoute } from "next";

import { getAdminSettings } from "@/lib/data/admin-settings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getAdminSettings();
  const appName = settings.branding.appName || "Harmomus";
  const description = settings.home.subheadline || "Kits vocais premium para equipes de louvor.";
  const startUrl = "/";

  const icons = [
    {
      src: "/android-chrome-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable",
    },
    {
      src: "/android-chrome-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ] as unknown as MetadataRoute.Manifest["icons"];

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
    icons,
  };
}
