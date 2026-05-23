import { ListObjectsV2Command } from "@aws-sdk/client-s3";

import { r2BucketName, r2Client } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);
const KNOWN_VOICES = ["todos", "soprano", "contralto", "tenor", "baritono"];
const TONE_RE = /^(A|A#|Bb|B|C|C#|Db|D|D#|Eb|E|F|F#|Gb|G|G#|Ab)$/i;

export interface R2KitImportResult {
  foldersScanned: number;
  kitsCreated: number;
  kitsUpdated: number;
  kitsSkipped: number;
  audioFilesCreated: number;
  audioFilesSkipped: number;
  errors: string[];
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70) || "kit";
}

function cleanName(value: string) {
  return decodeURIComponent(value)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVoice(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized.includes("soprano")) return "soprano";
  if (normalized.includes("contralto")) return "contralto";
  if (normalized.includes("tenor")) return "tenor";
  if (normalized.includes("baritono")) return "baritono";
  if (normalized.includes("todos") || normalized.includes("guia") || normalized.includes("all")) return "todos";
  return "todos";
}

function inferToneAndVoice(relativeParts: string[], filename: string) {
  const dot = filename.lastIndexOf(".");
  const baseName = dot > 0 ? filename.slice(0, dot) : filename;
  const fileType = dot > 0 ? filename.slice(dot + 1).toLowerCase() : "mp3";

  let tone = "Original";
  let voice = normalizeVoice(baseName);

  const first = relativeParts[0]?.trim();
  const second = relativeParts[1]?.trim();

  if (first && TONE_RE.test(first)) tone = first;

  if (second && KNOWN_VOICES.includes(second.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())) {
    voice = normalizeVoice(second);
  }

  const nameMatch = baseName.match(/(?:^|\s|-|_)(A#|Bb|B|C#|Db|C|D#|Eb|D|E|F#|Gb|F|G#|Ab|G)(?:\s|-|_|$)/i);
  if (tone === "Original" && nameMatch?.[1]) tone = nameMatch[1];

  if (voice === "todos") voice = normalizeVoice(baseName);

  return { tone, voice, name: cleanName(baseName), fileType };
}

function buildPublicUrl(key: string) {
  const publicBase = process.env.R2_PUBLIC_URL_BASE?.trim();
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/${key}`;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!accountId || !r2BucketName) return "";
  return `https://pub-${accountId}.r2.dev/${key}`;
}

async function listAllAudioObjects() {
  const objects: { key: string }[] = [];
  let ContinuationToken: string | undefined;

  do {
    const response = await r2Client.send(new ListObjectsV2Command({ Bucket: r2BucketName, ContinuationToken }));
    for (const object of response.Contents ?? []) {
      const key = object.Key ?? "";
      const ext = key.split(".").pop()?.toLowerCase() ?? "";
      if (key && !key.endsWith("/") && AUDIO_EXTENSIONS.has(ext)) objects.push({ key });
    }
    ContinuationToken = response.NextContinuationToken;
  } while (ContinuationToken);

  return objects;
}

async function findExistingKit(supabase: any, slug: string, folder: string) {
  const { data: bySlug, error: slugError } = await supabase
    .from("kits")
    .select("id, slug, r2_folder")
    .eq("slug", slug)
    .maybeSingle();

  if (slugError) throw new Error(slugError.message);
  if (bySlug) return bySlug;

  const { data: byFolder, error: folderError } = await supabase
    .from("kits")
    .select("id, slug, r2_folder")
    .eq("r2_folder", folder)
    .maybeSingle();

  if (folderError) throw new Error(folderError.message);
  return byFolder ?? null;
}

async function getOrCreateKit(supabase: any, kitName: string, slug: string, folder: string) {
  const existing = await findExistingKit(supabase, slug, folder);

  if (existing?.id) {
    if (existing.r2_folder !== folder) {
      await supabase.from("kits").update({ r2_folder: folder }).eq("id", existing.id);
    }
    return { kitId: existing.id as string, created: false };
  }

  const { data: created, error: createError } = await supabase
    .from("kits")
    .insert({
      name: kitName,
      slug,
      artist: "Artista não informado",
      r2_folder: folder,
      published: false,
    })
    .select("id")
    .single();

  if (!createError) return { kitId: created.id as string, created: true };

  const isDuplicate = createError.code === "23505" || String(createError.message ?? "").includes("duplicate key");
  if (!isDuplicate) throw new Error(createError.message);

  const fallback = await findExistingKit(supabase, slug, folder);
  if (fallback?.id) {
    await supabase.from("kits").update({ r2_folder: folder }).eq("id", fallback.id);
    return { kitId: fallback.id as string, created: false };
  }

  throw new Error(createError.message);
}

export async function importR2Kits(): Promise<R2KitImportResult> {
  const result: R2KitImportResult = {
    foldersScanned: 0,
    kitsCreated: 0,
    kitsUpdated: 0,
    kitsSkipped: 0,
    audioFilesCreated: 0,
    audioFilesSkipped: 0,
    errors: [],
  };

  if (!r2BucketName) {
    result.errors.push("R2_BUCKET_NAME não configurado.");
    return result;
  }

  const supabase = createSupabaseAdminClient() as any;
  const objects = await listAllAudioObjects();
  const byFolder = new Map<string, { key: string }[]>();

  for (const object of objects) {
    const parts = object.key.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const root = parts[0];
    const list = byFolder.get(root) ?? [];
    list.push(object);
    byFolder.set(root, list);
  }

  result.foldersScanned = byFolder.size;

  for (const [folder, files] of byFolder.entries()) {
    try {
      const kitName = cleanName(folder);
      const slug = toSlug(kitName);
      const { kitId, created } = await getOrCreateKit(supabase, kitName, slug, folder);

      if (created) result.kitsCreated += 1;
      else result.kitsUpdated += 1;

      const keys = files.map((file) => file.key);
      const { data: existingFiles, error: existingFilesError } = await supabase
        .from("kit_audio_files")
        .select("r2_key")
        .in("r2_key", keys);

      if (existingFilesError) throw new Error(existingFilesError.message);
      const existingKeys = new Set((existingFiles ?? []).map((file: any) => file.r2_key));

      const rows = files
        .filter((file) => !existingKeys.has(file.key))
        .map((file) => {
          const parts = file.key.split("/").filter(Boolean);
          const filename = parts[parts.length - 1] ?? file.key;
          const relativeParts = parts.slice(1, -1);
          const parsed = inferToneAndVoice(relativeParts, filename);
          return {
            kit_id: kitId,
            tone: parsed.tone,
            name: parsed.voice === "todos" ? parsed.name : parsed.voice,
            r2_key: file.key,
            public_url: buildPublicUrl(file.key),
            file_type: parsed.fileType,
          };
        });

      result.audioFilesSkipped += files.length - rows.length;

      if (rows.length) {
        const { error: insertFilesError } = await supabase.from("kit_audio_files").insert(rows);
        if (insertFilesError) throw new Error(insertFilesError.message);
        result.audioFilesCreated += rows.length;
      }
    } catch (error: any) {
      result.kitsSkipped += 1;
      result.errors.push(`${folder}: ${error.message ?? "erro desconhecido"}`);
    }
  }

  return result;
}
