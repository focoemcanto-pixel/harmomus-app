import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

const bucket = process.env.R2_BUCKET_NAME ?? "";

export async function uploadVideoToR2(key: string, body: Uint8Array) {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "video/mp4" }));
}
