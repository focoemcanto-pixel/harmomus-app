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
  originalTone: string | null;
  defaultTone: string | null;
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

function normalizeTone(value?: string | null) {
  const tone = value?.trim();
  if (!tone || tone === "Original") return null;
  return tone;
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
  return `audio/${r2Folder}/${safeTone}/${safeVoice}/${safeR2Filename(filename)}`;
}

async function findExistingKit(supabase: any, slug: string) {
  const { data, error } = await supabase.from("kits").select("id, slug, r2_folder").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

function resolveAudioFolder(existingFolder: string | null | undefined, slug: string) {
  const folder = existingFolder?.trim().replace(/^\/+|\/+$/g, "");
  if (!folder || folder.startsWith("images/") || folder.startsWith("covers/") || folder.includes("/kits/")) return slug;
  return folder.replace(/^audio\//, "");
}

async function ensureArtistCategory(supabase: any, artistName: string) {
  const name = artistName.trim();
  const slug = slugify(name);

  const { data: existing, error: existingError } = await supabase.from("categories").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (existingError) throw new Error(`Falha ao verificar artista: ${existingError.message}`);
  if (existing) return existing;

  const { data, error } = await supabase.from("categories").insert({ name, slug }).select("id, name, slug").single();
  if (error) throw new Error(`Falha ao criar artista automático: ${error.message}`);
  return data;
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
  originalTone,
  defaultTone,
}: {
  files: UploadedKitAudioInput[];
  name?: string | null;
  artist?: string | null;
  published?: boolean;
  originalTone?: string | null;
  defaultTone?: string | null;
}): Promise<UploadedKitAudioResult> {
  if (!r2BucketName) throw new Error("R2_BUCKET_NAME não configurado.");

  const audioFiles = files.filter((entry) => AUDIO_EXTENSIONS.has(getExtension(entry.file.name)));
  if (!audioFiles.length) throw new Error("Selecione pelo menos um áudio válido para importar.");

  for (const entry of audioFiles) validateAudioFile(entry.file);

  const supabase = createSupabaseAdminClient() as any;
  const kitName = inferKitName(audioFiles, name);
  const slug = slugify(kitName);
  const existing = await findExistingKit(supabase, slug);
  const r2Folder = resolveAudioFolder(existing?.r2_folder, slug);
  const artistName = artist?.trim() || "Artista não informado";
  const artistCategory = await ensureArtistCategory(supabase, artistName);
  const resolvedOriginalTone = normalizeTone(originalTone);
  const resolvedDefaultTone = normalizeTone(defaultTone) || resolvedOriginalTone;

  let kitId = existing?.id as string | undefined;
  let created = false;

  const kitPayload = {
    name: kitName,
    slug,
    artist: artistName,
    category_id: artistCategory.id,
    r2_folder: r2Folder,
    required_plan: null,
    allowed_plan_slugs: DEFAULT_ALLOWED_PLANS,
    original_tone: resolvedOriginalTone,
    default_tone: resolvedDefaultTone,
    allow_pitch_shift: true,
    max_pitch_shift_semitones: 2,
    published,
  };

  if (!kitId) {
    const { data: createdKit, error } = await supabase.from("kits").insert(kitPayload).select("id").single();

    if (error) throw new Error(`Falha ao criar kit: ${error.message}`);
    kitId = createdKit.id as string;
    created = true;
  } else {
    const { error } = await supabase.from("kits").update(kitPayload).eq("id", kitId);
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

  const { error: upsertError } = await supabase.from("kit_audio_files").upsert(rows, { onConflict: "kit_id,r2_key" });
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
    originalTone: resolvedOriginalTone,
    defaultTone: resolvedDefaultTone,
    editUrl: `/admin/kits/novo?importedKitId=${kitId}`,
  };
}
