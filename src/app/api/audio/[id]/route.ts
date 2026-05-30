import { NextRequest } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { registerKitAccess, resolveKitAccess } from "@/lib/access/access-rules";
import type { PublicKit } from "@/lib/data/public-kits";
import { getAudioStream } from "@/lib/r2/get-audio-stream";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";
import { normalizeTone, sortTonesByChromaticOrder } from "@/lib/music/tones";

export const runtime = "nodejs";

type ByteRange = { start: number; end?: number };

function parseRangeHeader(rangeHeader: string | null): ByteRange | null {
  if (!rangeHeader?.startsWith("bytes=")) return null;
  const value = rangeHeader.replace("bytes=", "").split(",")[0]?.trim();
  if (!value || value.startsWith("-")) return null;

  const [startRaw, endRaw] = value.split("-");
  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : undefined;

  if (Number.isNaN(start) || start < 0) return null;
  if (end !== undefined && (Number.isNaN(end) || end < start)) return null;
  return { start, end };
}

function shouldCountPlayback(range: ByteRange | null) {
  return !range || range.start === 0;
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

function resolveDeviceType(userAgent: string | null) {
  const ua = String(userAgent ?? "").toLowerCase();
  if (/mobile|android|iphone|ipad|ipod/.test(ua)) return "mobile";
  return "desktop";
}

function resolveSessionId(request: NextRequest) {
  return request.cookies.get("harmomus_session")?.value ?? null;
}

function resolvePagePath(request: NextRequest) {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`;
  } catch {
    return referer.slice(0, 200);
  }
}

function resolveRequiredPlan(plans: any[] | null | undefined, requiredPlanValue: unknown) {
  const raw = String(requiredPlanValue ?? "").trim();
  if (!raw) return null;
  return (plans ?? []).find((plan: any) => plan.id === raw || plan.slug === raw) ?? null;
}

function safeFilename(name: string | null | undefined, fileType: string | null | undefined) {
  const base = String(name ?? "audio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "audio";
  const ext = String(fileType ?? "mp3").replace(/[^a-zA-Z0-9]/g, "") || "mp3";
  return `${base}.${ext}`;
}

function isRangeNotSatisfiable(error: unknown) {
  const anyError = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number }; message?: string };
  const value = `${anyError?.name ?? ""} ${anyError?.Code ?? ""} ${anyError?.message ?? ""}`.toLowerCase();
  return anyError?.$metadata?.httpStatusCode === 416 || value.includes("range not satisfiable") || value.includes("invalidrange");
}

async function resolveOpeningTone(supabase: any, kit: any) {
  const explicitTone = normalizeTone(kit.default_tone) ?? normalizeTone(kit.original_tone);
  if (explicitTone) return explicitTone;
  const { data } = await supabase.from("kit_audio_files").select("tone").eq("kit_id", kit.id);
  const tones = Array.from(new Set((data ?? []).map((row: any) => normalizeTone(row.tone)).filter(Boolean))) as string[];
  return sortTonesByChromaticOrder(tones)[0] ?? null;
}

async function logAudioAccess(payload: { user_id: string | null; kit_id: string; audio_file_id: string; status: "allowed" | "denied"; reason: string; session_id?: string | null; device_type?: string | null; plan_slug?: string | null; page_path?: string | null }) {
  const supabase = createSupabaseAdminClient() as any;
  const enrichedPayload = { ...payload, accessed_at: new Date().toISOString() };
  const { error } = await supabase.from("audio_access_logs").insert(enrichedPayload);
  if (!error) return;
  await supabase.from("audio_access_logs").insert({ user_id: payload.user_id, kit_id: payload.kit_id, audio_file_id: payload.audio_file_id, status: payload.status, reason: payload.reason, accessed_at: enrichedPayload.accessed_at });
}

function runAfterResponse(task: () => Promise<void>) {
  setTimeout(() => {
    void task().catch((error) => console.warn("[audio] tarefa pós-resposta falhou", error));
  }, 0);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const { id } = await params;
  const supabase = await createClient();
  const { data: audioFile } = await (supabase as any).from("kit_audio_files").select("id,kit_id,tone,name,r2_key,file_type,source_type").eq("id", id).maybeSingle();
  if (!audioFile) return new Response("Áudio não encontrado.", { status: 404 });
  if (!audioFile.r2_key) return new Response("Áudio indisponível.", { status: 502 });

  const [{ data: kit }, { data: plans }, context] = await Promise.all([
    (supabase as any).from("kits").select("id,slug,name,artist,cover_url,description,lyrics,required_plan,allowed_plan_slugs,original_tone,default_tone,allow_pitch_shift,max_pitch_shift_semitones").eq("id", audioFile.kit_id).maybeSingle(),
    (supabase as any).from("plans").select("id,name,slug"),
    getCurrentUserAccessContext(),
  ]);
  if (!kit) return new Response("Kit não encontrado.", { status: 404 });

  const requiredPlan = resolveRequiredPlan(plans, kit.required_plan);
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
    allowedPlanSlugs: Array.isArray(kit.allowed_plan_slugs) && kit.allowed_plan_slugs.length ? kit.allowed_plan_slugs : requiredPlan?.slug === "premium" ? ["premium"] : requiredPlan?.slug === "plus" ? ["plus", "premium"] : ["free", "plus", "premium"],
    tones: [],
  };

  const access = await resolveKitAccess(context, accessKit);
  const analyticsContext = { session_id: resolveSessionId(request), device_type: resolveDeviceType(request.headers.get("user-agent")), plan_slug: context.effectiveSlug, page_path: resolvePagePath(request) };

  if (!access.play.allowed) {
    await logAudioAccess({ user_id: context.profile?.id ?? null, kit_id: kit.id, audio_file_id: audioFile.id, status: "denied", reason: access.play.reason, ...analyticsContext });
    return new Response("Acesso negado a este áudio.", { status: 403 });
  }

  if (!access.tone.allowed) {
    const openingTone = await resolveOpeningTone(supabase as any, kit);
    const requestedTone = normalizeTone(audioFile.tone);
    if (openingTone && requestedTone !== openingTone) {
      await logAudioAccess({ user_id: context.profile?.id ?? null, kit_id: kit.id, audio_file_id: audioFile.id, status: "denied", reason: "tone_restricted", ...analyticsContext });
      return new Response("Troca de tom indisponível para seu plano.", { status: 403 });
    }
  }

  const range = parseRangeHeader(request.headers.get("range"));
  const isPreloadRequest = request.nextUrl.searchParams.get("preload") === "1";
  const shouldTrackPlayback = !isPreloadRequest && shouldCountPlayback(range);

  let streamResponse: Awaited<ReturnType<typeof getAudioStream>>;
  try {
    streamResponse = await getAudioStream(audioFile.r2_key, range ?? undefined);
  } catch (error) {
    if (isRangeNotSatisfiable(error)) {
      return new Response(null, {
        status: 416,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
        },
      });
    }

    console.error("[audio] R2 stream failed", error);
    return new Response("Áudio indisponível.", { status: 502 });
  }

  const streamBody = streamResponse.Body;
  if (!streamBody) return new Response("Áudio indisponível.", { status: 502 });

  const status = range ? 206 : 200;
  const headers = new Headers();
  headers.set("Content-Type", resolveAudioContentType(audioFile.file_type, streamResponse.ContentType));
  headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=300");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Disposition", `inline; filename=\"${safeFilename(audioFile.name, audioFile.file_type)}\"`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Vary", "Range, Cookie");
  headers.set("X-Audio-Route-TTFB", String(Date.now() - startedAt));
  if (streamResponse.ETag) headers.set("ETag", streamResponse.ETag);
  if (streamResponse.LastModified) headers.set("Last-Modified", streamResponse.LastModified.toUTCString());
  if (streamResponse.ContentRange) headers.set("Content-Range", streamResponse.ContentRange);
  if (typeof streamResponse.ContentLength === "number") headers.set("Content-Length", String(streamResponse.ContentLength));

  if (shouldTrackPlayback) {
    runAfterResponse(async () => {
      if (context.effectiveSlug === "free" && context.profile?.id) {
        await registerKitAccess(context.profile.id, kit.id);
      }
      await logAudioAccess({ user_id: context.profile?.id ?? null, kit_id: kit.id, audio_file_id: audioFile.id, status: "allowed", reason: "ok", ...analyticsContext });
      await dispatchWebhookEvent({ event: "audio.played", source: "audio.stream", recipient: { name: context.profile?.full_name ?? null, email: context.profile?.email ?? null, phone: context.profile?.phone ?? null }, data: { kit: { id: kit.id, slug: kit.slug, nome: kit.name }, categoria: requiredPlan?.slug ?? null, usuario: { id: context.profile?.id ?? null, email: context.profile?.email ?? null }, arquivo: { id: audioFile.id, nome: audioFile.name, tom: audioFile.tone }, played_at: new Date().toISOString() } });
    });
  }

  return new Response(streamBody.transformToWebStream(), { status, headers });
}
