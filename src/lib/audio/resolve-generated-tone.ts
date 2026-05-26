import { normalizeTone, type CanonicalTone } from "@/lib/music/tones";

export interface ResolveGeneratedToneInput {
  kitSlug: string;
  voice: string;
  tone: string;
  baseUrl?: string | null;
  extension?: "mp3" | "wav";
}

function normalizePathPart(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9#-]/g, "");
}

export function resolveGeneratedTone({
  kitSlug,
  voice,
  tone,
  baseUrl,
  extension = "mp3",
}: ResolveGeneratedToneInput): { tone: CanonicalTone; key: string; url: string } | null {
  const normalizedTone = normalizeTone(tone);
  if (!normalizedTone) return null;

  const key = `kits/${normalizePathPart(kitSlug)}/${normalizePathPart(voice)}/${normalizedTone}.${extension}`;
  const resolvedBase = (baseUrl ?? "").trim().replace(/\/$/, "");
  const url = resolvedBase ? `${resolvedBase}/${key}` : key;

  return { tone: normalizedTone, key, url };
}
