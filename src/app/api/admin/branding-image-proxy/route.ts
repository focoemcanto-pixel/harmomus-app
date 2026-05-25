import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

export async function GET(request: NextRequest) {
  try {
    const rawUrl = request.nextUrl.searchParams.get("url");
    if (!rawUrl) {
      return NextResponse.json({ error: "URL da imagem não informada." }, { status: 400 });
    }

    const imageUrl = new URL(rawUrl);
    if (!/^https?:$/.test(imageUrl.protocol)) {
      return NextResponse.json({ error: "URL de imagem inválida." }, { status: 400 });
    }

    const response = await fetch(imageUrl.toString(), {
      cache: "no-store",
      headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Falha ao buscar imagem: ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() || "image/png";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Arquivo remoto não é uma imagem permitida." }, { status: 415 });
    }

    const body = await response.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Falha no proxy de imagem de branding", error);
    return NextResponse.json({ error: "Falha ao abrir imagem para edição." }, { status: 500 });
  }
}
