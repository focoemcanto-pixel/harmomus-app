import { PutObjectCommand } from "@aws-sdk/client-s3";

import { r2BucketName, r2Client } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);
const TONE_RE = /^(A|A#|Bb|B|C|C#|Db|D|D#|Eb|E|F|F#|Gb|G|G#|Ab)$/i;
const DEFAULT_ALLOWED_PLANS = ["free", "plus", "premium"];
const MAX_AUDIO_FILE_SIZE_BYTES = 120 * 1024 * 1024;

export type UploadedKitAudioInput = {
  file: File;
  relativePath: string;
};

export type UploadedKitAudioResult = {
  kitId: string;
  kitName: string;
  slug: string;
  r2Folder: string;
  created: boolean;
  uploadedFiles: number;
  skippedFiles: number;
  tones: string[];
  voices: string[];
  editUrl: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 70) || "kit";
}

function cleanName(value: string) {
  return decodeURIComponent(value)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePath(value: string) {
  return value.replace(/\\+/g, "/").split("/").filter(Boolean).join("/");
}

function normalizeVoice(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized.includes("soprano")) return "soprano";
  if (normalized.includes("contralto") || normalized.includes("alto")) return "contralto";
  if (normalized.includes("tenor")) return "tenor";
  if (normalized.includes("baritono") || normalized.includes("barítono")) return "baritono";
  if (normalized.includes("baixo")) return "baixo";
  if (normalized.includes("todos") || normalized.includes("all") || normalized.includes("guia") || normalized.includes("completo")) return "todos";
  return "todos";
}

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function buildPublicUrl(key: string) {
  const publicBase = process.env.R2_PUBLIC_BASE_URL?.trim() || process.env.R2_PUBLIC_URL_BASE?.trim();
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/${key}`;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!accountId || !r2BucketName) return "";
  return `https://pub-${accountId}.r2.dev/${key}`;
}

function inferKitName(files: UploadedKitAudioInput[], fallbackName?: string | null) {
  const explicit = fallbackName?.trim();
  if (explicit) return explicit;

  const firstPath = normalizePath(files[0]?.relativePath || files[0]?.file.name || "Novo Kit");
  const parts = firstPath.split("/").filter(Boolean);
  if (parts.length > 1) return cleanName(parts[0]);
  return cleanName(parts[0] || "Novo Kit");
}

function inferToneAndVoice(relativePath: string, fallbackFilename: string) {
  const path = normalizePath(relativePath || fallbackFilename);
  const parts = path.split("/").filter(Boolean);
  const filename = parts[parts.length - 1] || fallbackFilename;
  const filenameWithoutExt = filename.replace(/\.[a-z0-9]+$/i, "");
  const relativeParts = parts.length > 1 ? parts.slice(1, -1) : [];

  let tone = "Original";
  let voice = normalizeVoice(filenameWithoutExt);

  const firstFolder = relativeParts[0]?.trim();
  const secondFolder = relativeParts[1]?.trim();

  if (firstFolder && TONE_RE.test(firstFolder)) tone = firstFolder;
  if (secondFolder) voice = normalizeVoice(secondFolder);

  const nameTone = filenameWithoutExt.match(/(?:^|\s|-|_)(A#|Bb|B|C#|Db|C|D#|Eb|D|E|F#|Gb|F|G#|Ab|G)(?:\s|-|_|$)/i);
  if (tone === "Original" && nameTone?.[1]) tone = nameTone[1];

  return {
    tone,
    voice,
    displayName: voice === "todos" ? cleanName(filenameWithoutExt) : voice,
    fileType: getExtension(filename) || "mp3",
  };
}

function safeR2Filename(value: string) {
  const ext = getExtension(value);
  const base = cleanName(value);
  const safeBase = slugify(base) || "audio";
  return ext ? `${safeBase}.${ext}` : safeBase;
}

function buildAudioR2Key({ r2Folder, tone, voice, filename }: { r2Folder: string; tone: string; voice: string; filename: string }) {
  const safeTone = tone === "Original" ? "original" : tone;
  const safeVoice = slugify(voice || "todos");
  return `${r2Folder}/${safeTone}/${safeVoice}/${safeR2Filename(filename)}`;
}

async function resolveUniqueSlug(supabase: any, desiredSlug: string) {
  let slug = desiredSlug;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabase.from("kits").select("id").eq("slug", slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return slug;
    slug = `${desiredSlug}-${suffix}`;
    suffix += 1;
  }
}

async function findExistingKit(supabase: any, slug: string) {
  const { data, error } = await supabase.from("kits").select("id, slug, r2_folder").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

function validateAudioFile(file: File) {
  const ext = getExtension(file.name);
  if (!AUDIO_EXTENSIONS.has(ext)) throw new Error(`Arquivo não suportado: ${file.name}`);
  if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) throw new Error(`Arquivo muito grande: ${file.name}. Limite: 120MB.`);
}

export async function uploadKitAudioBundle({
  files,
  name,
  artist,
  published = false,
}: {
  files: UploadedKitAudioInput[];
  name?: string | null;
  artist?: string | null;
  published?: boolean;
}): Promise<UploadedKitAudioResult> {
  if (!r2BucketName) throw new Error("R2_BUCKET_NAME não configurado.");

  const audioFiles = files.filter((entry) => AUDIO_EXTENSIONS.has(getExtension(entry.file.name)));
  if (!audioFiles.length) throw new Error("Selecione pelo menos um áudio válido para importar.");

  for (const entry of audioFiles) validateAudioFile(entry.file);

  const supabase = createSupabaseAdminClient() as any;
  const kitName = inferKitName(audioFiles, name);
  const desiredSlug = slugify(kitName);
  const existing = await findExistingKit(supabase, desiredSlug);
  const slug = existing?.slug ?? (await resolveUniqueSlug(supabase, desiredSlug));
  const r2Folder = existing?.r2_folder || slug;
  const artistName = artist?.trim() || "Artista não informado";

  let kitId = existing?.id as string | undefined;
  let created = false;

  if (!kitId) {
    const { data: createdKit, error } = await supabase
      .from("kits")
      .insert({
        name: kitName,
        slug,
        artist: artistName,
        r2_folder: r2Folder,
        published,
        allowed_plan_slugs: DEFAULT_ALLOWED_PLANS,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Falha ao criar kit: ${error.message}`);
    kitId = createdKit.id as string;
    created = true;
  } else {
    const { error } = await supabase
      .from("kits")
      .update({ name: kitName, artist: artistName, r2_folder: r2Folder })
      .eq("id", kitId);

    if (error) throw new Error(`Falha ao atualizar kit existente: ${error.message}`);
  }

  const rows: any[] = [];
  const tones = new Set<string>();
  const voices = new Set<string>();
  let uploadedFiles = 0;

  for (const entry of audioFiles) {
    const parsed = inferToneAndVoice(entry.relativePath, entry.file.name);
    const key = buildAudioR2Key({ r2Folder, tone: parsed.tone, voice: parsed.voice, filename: entry.file.name });
    const body = Buffer.from(await entry.file.arrayBuffer());

    await r2Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: key,
        Body: body,
        ContentType: entry.file.type || `audio/${parsed.fileType}`,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    rows.push({
      kit_id: kitId,
      tone: parsed.tone,
      name: parsed.displayName,
      r2_key: key,
      public_url: buildPublicUrl(key),
      file_type: parsed.fileType,
      source_type: "original",
    });

    tones.add(parsed.tone);
    voices.add(parsed.voice);
    uploadedFiles += 1;
  }

  const { error: upsertError } = await supabase.from("kit_audio_files").upsert(rows, { onConflict: "r2_key" });
  if (upsertError) throw new Error(`Falha ao registrar áudios no banco: ${upsertError.message}`);

  return {
    kitId,
    kitName,
    slug,
    r2Folder,
    created,
    uploadedFiles,
    skippedFiles: files.length - audioFiles.length,
    tones: Array.from(tones),
    voices: Array.from(voices),
    editUrl: `/admin/kits/${kitId}/editar`,
  };
}
