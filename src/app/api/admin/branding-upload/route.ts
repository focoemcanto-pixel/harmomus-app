import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { r2BucketName, r2Client } from "@/lib/r2/client";

const ALLOWED_ASSETS = new Set(["logo", "favicon", "login", "hero", "og"]);

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem enviar imagens de identidade." }, { status: 403 });
    }

    if (!r2BucketName) {
      return NextResponse.json({ error: "R2_BUCKET_NAME não configurado." }, { status: 400 });
    }

    const form = await request.formData();
    const asset = String(form.get("asset") ?? "").trim();
    const file = form.get("file");

    if (!ALLOWED_ASSETS.has(asset)) {
      return NextResponse.json({ error: "Tipo de imagem inválido." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Envie apenas imagens." }, { status: 400 });
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
      CacheControl: "public, max-age=31536000, immutable",
    }));

    const customDomain = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
    const baseUrl = customDomain || `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev`;
    const url = `${baseUrl}/${key}?v=${Date.now()}`;

    return NextResponse.json({ success: true, asset, key, url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado." }, { status: 400 });
  }
}
