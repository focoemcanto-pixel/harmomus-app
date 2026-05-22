import { PutObjectCommand } from "@aws-sdk/client-s3";

import { r2BucketName, r2Client } from "@/lib/r2/client";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const VALID_IMAGE_TYPE = /^image\//;

function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function generateFilePath(slug: string, context: "kit-cover" | "category-cover" | "banner" | "profile-avatar" = "kit-cover"): string {
  const safeSlug = slugifySegment(slug);

  if (!safeSlug) {
    throw new Error("Slug inválido para gerar caminho de upload.");
  }

  if (context === "profile-avatar") return `avatars/${safeSlug}/avatar.jpg`;
  const folder = context === "category-cover" ? "categories" : context === "banner" ? "banners" : "kits";
  return `images/${folder}/${safeSlug}/cover.webp`;
}

export function validateImageFile(file: File): void {
  if (!VALID_IMAGE_TYPE.test(file.type)) {
    throw new Error("Apenas imagens são permitidas.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("A imagem deve ter no máximo 5MB.");
  }
}

export async function uploadKitCoverToR2({
  file,
  slug,
  context = "kit-cover",
}: {
  file: File;
  slug: string;
  context?: "kit-cover" | "category-cover" | "banner" | "profile-avatar";
}): Promise<{ key: string; url: string }> {
  if (!r2BucketName) {
    throw new Error("R2_BUCKET_NAME não configurado.");
  }

  validateImageFile(file);

  const key = generateFilePath(slug, context);
  const body = Buffer.from(await file.arrayBuffer());

  // TODO: aplicar compressão/conversão automática para webp antes do upload.
  await r2Client.send(
    new PutObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const customDomain = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");

  // TODO: suportar múltiplos uploads na mesma operação.
  // TODO: suportar CDN customizada e versionamento de URL.
  const url = customDomain ? `${customDomain}/${key}` : `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev/${key}`;

  return { key, url };
}
