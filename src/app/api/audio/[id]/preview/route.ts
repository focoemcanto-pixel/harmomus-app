import { NextRequest } from "next/server";

import { getAudioStream } from "@/lib/r2/get-audio-stream";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ByteRange = { start: number; end?: number; suffix?: number };

type PreviewAudioFile = {
  id: string;
  kit_id: string;
  name: string | null;
  r2_key: string | null;
  file_type: string | null;
};

type PreviewKit = {
  id: string;
  published: boolean | null;
  preview_audio_file_id: string | null;
};

export const runtime = "nodejs";

const PREVIEW_META_TTL_MS = 10 * 60 * 1000;
const previewMetaCache = new Map<string, { expiresAt: number; audioFile: PreviewAudioFile | null; kit: PreviewKit | null }>();

function nowMs() {
  return Date.now();
}

function parseRangeHeader(rangeHeader: string | null): ByteRange | null {
  if (!rangeHeader?.startsWith("bytes=")) return null;
  const value = rangeHeader.replace("bytes=", "").split(",")[0]?.trim();
  if (!value) return null;

  const [startRaw, endRaw] = value.split("-");
  if (startRaw === "") {
    const suffix = Number.parseInt(endRaw ?? "", 10);
    if (Number.isNaN(suffix) || suffix <= 0) return null;
    return { start: 0, suffix };
  }

  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : undefined;
  if (Number.isNaN(start) || start < 0) return null;
  if (end !== undefined && (Number.isNaN(end) || end < start)) return null;
  return { start, end };
}

function resolveAudioContentType(fileType: string | null | undefined, upstreamContentType: string | null | undefined) {
  const normalized = String(fileType ?? "").toLowerCase().replace(/^audio\//, "");
  if (normalized === "mp3" || normalized === "mpeg") return "audio/mpeg";
  if (normalized === "wav" || normalized === "wave") return "audio/wav";
  if (normalized === "ogg") return "audio/ogg";
  if (normalized === "m4a" || normalized === "mp4") return "audio/mp4";
  if (upstreamContentType?.startsWith("audio/")) return upstreamContentType;
  return "audio/mpeg";
}

function safeFilename(name: string | null | undefined, fileType: string | null | undefined) {
  const base = String(name ?? "preview")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "preview";
  const ext = String(fileType ?? "mp3").replace(/[^a-zA-Z0-9]/g, "") || "mp3";
  return `${base}.${ext}`;
}

function isRangeNotSatisfiable(error: unknown) {
  const anyError = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number }; message?: string };
  const value = `${anyError?.name ?? ""} ${anyError?.Code ?? ""} ${anyError?.message ?? ""}`.toLowerCase();
  return anyError?.$metadata?.httpStatusCode === 416 || value.includes("range not satisfiable") || value.includes("invalidrange");
}

async function getPreviewMeta(id: string) {
  const cached = previewMetaCache.get(id);
  if (cached && cached.expiresAt > nowMs()) return cached;

  const supabase = createSupabaseAdminClient() as any;
  const { data: audioFile, error: audioError } = await supabase
    .from("kit_audio_files")
    .select("id,kit_id,name,r2_key,file_type")
    .eq("id", id)
    .maybeSingle();

  if (audioError || !audioFile) {
    const value = { expiresAt: nowMs() + PREVIEW_META_TTL_MS, audioFile: null, kit: null };
    previewMetaCache.set(id, value);
    return value;
  }

  const { data: kit } = await supabase
    .from("kits")
    .select("id,published,preview_audio_file_id")
    .eq("id", audioFile.kit_id)
    .maybeSingle();

  const value = {
    expiresAt: nowMs() + PREVIEW_META_TTL_MS,
    audioFile: audioFile as PreviewAudioFile,
    kit: (kit ?? null) as PreviewKit | null,
  };
  previewMetaCache.set(id, value);
  return value;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const range = parseRangeHeader(request.headers.get("range"));
  const { audioFile, kit } = await getPreviewMeta(id);

  if (!audioFile || !kit || !kit.published || kit.preview_audio_file_id !== audioFile.id) {
    return new Response("Preview indisponível.", { status: 404 });
  }

  if (!audioFile.r2_key) return new Response("Preview indisponível.", { status: 502 });

  let streamResponse: Awaited<ReturnType<typeof getAudioStream>>;
  try {
    streamResponse = await getAudioStream(audioFile.r2_key, range ?? undefined);
  } catch (error) {
    if (isRangeNotSatisfiable(error)) {
      return new Response(null, {
        status: 416,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      });
    }
    console.error("[audio-preview] R2 stream failed", error);
    return new Response("Preview indisponível.", { status: 502 });
  }

  const streamBody = streamResponse.Body;
  if (!streamBody) return new Response("Preview indisponível.", { status: 502 });

  const status = range ? 206 : 200;
  const headers = new Headers();
  headers.set("Content-Type", resolveAudioContentType(audioFile.file_type, streamResponse.ContentType));
  headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Disposition", `inline; filename=\"${safeFilename(audioFile.name, audioFile.file_type)}\"`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Vary", "Range");
  headers.set("X-Audio-Preview", "1");
  if (streamResponse.ETag) headers.set("ETag", streamResponse.ETag);
  if (streamResponse.LastModified) headers.set("Last-Modified", streamResponse.LastModified.toUTCString());
  if (streamResponse.ContentRange) headers.set("Content-Range", streamResponse.ContentRange);
  if (typeof streamResponse.ContentLength === "number") headers.set("Content-Length", String(streamResponse.ContentLength));

  return new Response(streamBody.transformToWebStream(), { status, headers });
}
