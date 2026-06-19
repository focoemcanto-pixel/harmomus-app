import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
];

function isPrivateHost(hostname: string) {
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return true;
  const match = hostname.match(/^172\.(\d+)\./);
  if (!match) return false;
  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isAllowedImageContentType(contentType: string) {
  return contentType.startsWith("image/") || contentType === "application/octet-stream";
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "URL da imagem não informada." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "URL da imagem inválida." }, { status: 400 });
  }

  if (!["https:", "http:"].includes(target.protocol)) {
    return NextResponse.json({ error: "Protocolo da imagem não permitido." }, { status: 400 });
  }

  if (isPrivateHost(target.hostname)) {
    return NextResponse.json({ error: "Host da imagem não permitido." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(target.toString(), {
      cache: "no-store",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "HarmomusImageProxy/1.0",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return NextResponse.json({ error: `Imagem retornou HTTP ${response.status}.` }, { status: response.status });
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "image/png";
    if (!isAllowedImageContentType(contentType)) {
      return NextResponse.json({ error: "Conteúdo não é uma imagem." }, { status: 415 });
    }

    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar imagem." },
      { status: 502 },
    );
  }
}
