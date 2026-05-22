import { ListObjectsV2Command } from "@aws-sdk/client-s3";

import { r2BucketName, r2Client } from "@/lib/r2/client";
import type { KitAudioFile, KitAudioToneGroup } from "@/types/kit-audio";

const VOICES = ["todos", "soprano", "contralto", "tenor"] as const;
type Voice = (typeof VOICES)[number];

function normalizeVoice(value: string): Voice {
  const normalized = value.trim().toLowerCase();
  return (VOICES as readonly string[]).includes(normalized) ? (normalized as Voice) : "todos";
}

function buildPublicUrl(key: string) {
  const publicBase = process.env.R2_PUBLIC_URL_BASE?.trim();
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/${key}`;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!accountId || !r2BucketName) return "";

  return `https://pub-${accountId}.r2.dev/${key}`;
}

export async function listKitAudioFiles(r2Folder: string): Promise<{ tones: KitAudioToneGroup[] }> {
  const normalizedFolder = r2Folder.trim().replace(/^\/+|\/+$/g, "");
  if (!normalizedFolder) return { tones: [] };

  const prefix = `audio/${normalizedFolder}/`;

  const response = await r2Client.send(
    new ListObjectsV2Command({
      Bucket: r2BucketName,
      Prefix: prefix,
    }),
  );

  const groups = new Map<string, KitAudioFile[]>();

  for (const object of response.Contents ?? []) {
    const key = object.Key ?? "";
    if (!key || key.endsWith("/")) continue;

    const relativePath = key.slice(prefix.length);
    const parts = relativePath.split("/").filter(Boolean);
    if (parts.length < 2) continue;

    const tone = parts[0]?.trim();
    const maybeVoice = parts[1] ?? "";
    const hasVoiceFolder = (VOICES as readonly string[]).includes(maybeVoice.trim().toLowerCase());
    const voice = hasVoiceFolder ? normalizeVoice(maybeVoice) : "todos";
    const filename = parts[parts.length - 1]?.trim();
    if (!tone || !filename) continue;

    const dotIndex = filename.lastIndexOf(".");
    const name = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
    const fileType = dotIndex > 0 ? filename.slice(dotIndex + 1).toLowerCase() : "unknown";

    const file: KitAudioFile = {
      tone,
      voice,
      name,
      key,
      url: buildPublicUrl(key),
      fileType,
    };

    if (!groups.has(tone)) groups.set(tone, []);
    groups.get(tone)?.push(file);
  }

  const tones: KitAudioToneGroup[] = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tone, files]) => ({
      tone,
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    }));

  return { tones };
}
