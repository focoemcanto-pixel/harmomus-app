import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { r2BucketName, r2Client } from "@/lib/r2/client";

export const dynamic = "force-dynamic";

const ALLOWED_ASSETS = new Set(["logo", "favicon", "login", "hero", "og"]);
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem enviar imagens de identidade." }, { status: 403 });
    }

    if (!r2BucketName) {
      return NextResponse.json({ error: "R2_BUCKET_NAME não configurado." }, { status: 500 });
    }

    const form = await request.formData();
    const asset = String(form.get("asset") ?? "").trim().toLowerCase();
    const file = form.get("file");

    if (!ALLOWED_ASSETS.has(asset)) {
      return NextResponse.json({ error: "Tipo de imagem inválido." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Envie apenas imagens PNG, JPG ou WEBP." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "Imagem muito grande. O limite é 8MB." }, { status: 400 });
    }

    const extension = asset === "favicon" ? "png" : "webp";
    const contentType = asset === "favicon" ? "image/png" : "image/webp";
    const key = `images/branding/${asset}.${extension}`;
    const body = Buffer.from(await file.arrayBuffer());

    await r2Client.send(new PutObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=300, must-revalidate",
    }));

    const customDomain = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
    const baseUrl = customDomain || (process.env.R2_ACCOUNT_ID ? `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev` : "");

    if (!baseUrl) {
      return NextResponse.json({ error: "R2_PUBLIC_BASE_URL ou R2_ACCOUNT_ID não configurado." }, { status: 500 });
    }

    const version = Date.now();
    const url = `${baseUrl}/${key}?v=${version}`;

    return NextResponse.json({ ok: true, success: true, asset, key, url, version });
  } catch (error) {
    console.error("Falha no upload de branding", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado no upload de branding." }, { status: 500 });
  }
}
