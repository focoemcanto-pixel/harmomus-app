import { NextRequest } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { resolveKitAccess } from "@/lib/access/access-rules";
import type { PublicKit } from "@/lib/data/public-kits";
import { getAudioStream } from "@/lib/r2/get-audio-stream";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function parseRangeHeader(rangeHeader: string | null, totalSize?: number): { start: number; end?: number } | null {
  if (!rangeHeader?.startsWith("bytes=")) return null;
  const value = rangeHeader.replace("bytes=", "").split(",")[0]?.trim();
  if (!value) return null;

  const [startRaw, endRaw] = value.split("-");
  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : undefined;

  if (Number.isNaN(start) || start < 0) return null;
  if (end !== undefined && (Number.isNaN(end) || end < start)) return null;
  if (totalSize !== undefined && start >= totalSize) return null;

  return { start, end };
}

async function logAudioAccess(payload: {
  user_id: string | null;
  kit_id: string;
  audio_file_id: string;
  status: "allowed" | "denied";
  reason: string;
}) {
  try {
    const supabase = await createClient();
    await (supabase as any).from("audio_access_logs").insert(payload);
  } catch {
    // TODO: adicionar telemetria estruturada caso a tabela ainda não exista no ambiente.
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: audioFile } = await (supabase as any)
    .from("kit_audio_files")
    .select("id,kit_id,tone,name,r2_key,file_type")
    .eq("id", id)
    .maybeSingle();

  if (!audioFile) {
    return new Response("Áudio não encontrado.", { status: 404 });
  }

  const [{ data: kit }, { data: plans }, context] = await Promise.all([
    (supabase as any)
      .from("kits")
      .select("id,slug,name,artist,cover_url,description,lyrics,required_plan,original_tone,default_tone,allow_pitch_shift,max_pitch_shift_semitones")
      .eq("id", audioFile.kit_id)
      .maybeSingle(),
    (supabase as any).from("plans").select("id,name,slug"),
    getCurrentUserAccessContext(),
  ]);

  if (!kit) {
    return new Response("Kit não encontrado.", { status: 404 });
  }

  const requiredPlan = (plans ?? []).find((p: any) => p.slug === kit.required_plan) ?? null;
  const accessKit: PublicKit = {
    id: kit.id,
    slug: kit.slug,
    name: kit.name,
    artist: kit.artist,
    coverUrl: kit.cover_url,
    description: kit.description,
    lyrics: kit.lyrics,
    originalTone: kit.original_tone ?? null,
    defaultTone: kit.default_tone ?? kit.original_tone ?? null,
    allowPitchShift: kit.allow_pitch_shift ?? true,
    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,
    category: null,
    requiredPlan,
    tones: [],
  };

  const access = await resolveKitAccess(context, accessKit);

  if (!access.play.allowed) {
    await logAudioAccess({
      user_id: context.profile?.id ?? null,
      kit_id: kit.id,
      audio_file_id: audioFile.id,
      status: "denied",
      reason: access.play.reason,
    });

    return new Response("Acesso negado a este áudio.", { status: 403 });
  }

  if (!access.tone.allowed) {
    const toneMatchAllowed = await (supabase as any)
      .from("kit_audio_files")
      .select("tone")
      .eq("kit_id", kit.id)
      .order("tone", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (toneMatchAllowed.data?.tone && toneMatchAllowed.data.tone !== audioFile.tone) {
      await logAudioAccess({
        user_id: context.profile?.id ?? null,
        kit_id: kit.id,
        audio_file_id: audioFile.id,
        status: "denied",
        reason: "tone_restricted",
      });
      return new Response("Troca de tom indisponível para seu plano.", { status: 403 });
    }
  }

  const range = parseRangeHeader(request.headers.get("range"));
  const streamResponse = await getAudioStream(audioFile.r2_key, range ?? undefined);
  const streamBody = streamResponse.Body;
  if (!streamBody) return new Response("Áudio indisponível.", { status: 502 });

  const totalLength = typeof streamResponse.ContentLength === "number" ? streamResponse.ContentLength : undefined;
  const status = range ? 206 : 200;
  const headers = new Headers();
  headers.set("Content-Type", streamResponse.ContentType ?? `audio/${audioFile.file_type}`);
  headers.set("Cache-Control", "private, max-age=60, must-revalidate");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Disposition", `inline; filename="${audioFile.name}.${audioFile.file_type}"`);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  if (streamResponse.ETag) headers.set("ETag", streamResponse.ETag);
  if (streamResponse.LastModified) headers.set("Last-Modified", streamResponse.LastModified.toUTCString());
  if (streamResponse.ContentRange) headers.set("Content-Range", streamResponse.ContentRange);
  if (typeof streamResponse.ContentLength === "number") headers.set("Content-Length", String(streamResponse.ContentLength));

  if (range && !streamResponse.ContentRange && totalLength !== undefined) {
    const end = range.end ?? Math.max(range.start, totalLength - 1);
    headers.set("Content-Range", `bytes ${range.start}-${end}/${totalLength}`);
  }

  await logAudioAccess({
    user_id: context.profile?.id ?? null,
    kit_id: kit.id,
    audio_file_id: audioFile.id,
    status: "allowed",
    reason: "ok",
  });

  return new Response(streamBody.transformToWebStream(), { status, headers });
}
