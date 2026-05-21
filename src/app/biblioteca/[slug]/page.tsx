import { notFound } from "next/navigation";

import { KitPageTemplate } from "@/components/public/kit-page-template";
import { getPublishedKitBySlug } from "@/lib/data/public-kits";

export default async function BibliotecaKitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kit = await getPublishedKitBySlug(slug);

  if (!kit) notFound();

  return <KitPageTemplate kit={kit} />;
}
