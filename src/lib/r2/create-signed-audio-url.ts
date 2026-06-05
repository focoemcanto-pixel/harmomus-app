import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { r2BucketName, r2Client } from "@/lib/r2/client";

export async function createSignedAudioUrl(key: string, expiresInSeconds = 300) {
  if (!key) throw new Error("Chave R2 obrigatória para gerar URL assinada.");

  const command = new GetObjectCommand({
    Bucket: r2BucketName,
    Key: key,
  });

  return getSignedUrl(r2Client, command, {
    expiresIn: Math.max(60, Math.min(expiresInSeconds, 900)),
  });
}
