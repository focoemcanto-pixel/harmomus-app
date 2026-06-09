import { NextResponse } from "next/server";

import { getPublishedKitBySlug } from "@/lib/data/public-kits";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const kit = await getPublishedKitBySlug(slug);

    if (!kit) {
      return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ lyrics: kit.lyrics ?? "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar a letra.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
