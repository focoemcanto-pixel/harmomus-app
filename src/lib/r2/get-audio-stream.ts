import { GetObjectCommand } from "@aws-sdk/client-s3";

import { r2BucketName, r2Client } from "@/lib/r2/client";

export interface AudioRange {
  start: number;
  end?: number;
}

export async function getAudioStream(key: string, range?: AudioRange) {
  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      Range: range ? `bytes=${range.start}-${range.end ?? ""}` : undefined,
    }),
  );

  if (!response.Body) throw new Error("Stream de áudio não encontrado no R2.");

  return response;
}
