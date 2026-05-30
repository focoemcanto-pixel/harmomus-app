import { NextResponse } from "next/server";

function isAllowedImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function inferContentType(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.startsWith("image/")) return contentType;
  return "image/jpeg";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const src = url.searchParams.get("src")?.trim() || "";

  if (!src || !isAllowedImageUrl(src)) {
    return NextResponse.json({ error: "Imagem inválida." }, { status: 400 });
  }

  try {
    const response = await fetch(src, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      cf: { cacheTtl: 60 * 60 * 24 * 7, cacheEverything: true } as RequestInit["cf"],
    } as RequestInit);

    if (!response.ok) {
      return NextResponse.json({ error: "Não foi possível carregar a capa." }, { status: response.status });
    }

    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": inferContentType(response),
        "cache-control": "public, max-age=604800, immutable",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    console.error("[media-session.artwork] erro ao carregar capa", error);
    return NextResponse.json({ error: "Erro ao carregar capa." }, { status: 500 });
  }
}
