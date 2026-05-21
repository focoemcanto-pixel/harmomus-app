import { PublicAppShell } from "@/components/public/public-app-shell";
import { notFound } from "next/navigation";

import { KitPageTemplate } from "@/components/public/kit-page-template";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { resolveKitAccess } from "@/lib/access/access-rules";
import { getPublishedKitBySlug } from "@/lib/data/public-kits";

export default async function BibliotecaKitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kit = await getPublishedKitBySlug(slug);
  if (!kit) notFound();

  const current = await getCurrentUserAccessContext();
  const accessContext = await resolveKitAccess(current, kit);

  return <PublicAppShell><KitPageTemplate kit={kit} accessContext={{ ...current, ...accessContext }} /></PublicAppShell>;
}
