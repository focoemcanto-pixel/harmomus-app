import { NextResponse } from "next/server";

import { resolveKitAccess } from "@/lib/access/access-rules";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import type { PublicKit } from "@/lib/data/public-kits";
import { normalizeTone, sortTonesByChromaticOrder } from "@/lib/music/tones";
import { createSignedAudioUrl } from "@/lib/r2/create-signed-audio-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SIGNED_AUDIO_TTL_SECONDS = 3600;
const PLANS_CACHE_TTL_MS = 5 * 60 * 1000;
const AUDIO_META_CACHE_TTL_MS = 10 * 60 * 1000;
const KIT_META_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedAudioFile = {
  id: string;
  kit_id: string;
  tone: string | null;
  name: string | null;
  r2_key: string | null;
  file_type: string | null;
  source_type: string | null;
};

type CachedKit = {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  cover_url: string | null;
  description: string | null;
  lyrics: string | null;
  required_plan: string | null;
  allowed_plan_slugs: string[] | null;
  original_tone: string | null;
  default_tone: string | null;
  allow_pitch_shift: boolean | null;
  max_pitch_shift_semitones: number | null;
};

let plansCache: { expiresAt: number; plans: any[] } | null = null;
const audioFileCache = new Map<string, { expiresAt: number; value: CachedAudioFile | null }>();
const kitCache = new Map<string, { expiresAt: number; value: CachedKit | null }>();

function nowMs() {
  return Date.now();
}

function resolveRequiredPlan(plans: any[] | null | undefined, requiredPlanValue: unknown) {
  const raw = String(requiredPlanValue ?? "").trim();
  if (!raw) return null;
  return (plans ?? []).find((plan: any) => plan.id === raw || plan.slug === raw) ?? null;
}

function resolveAllowedPlanSlugs(allowedPlanSlugs: string[] | null | undefined, requiredPlan: { slug?: string | null } | null): PublicKit["allowedPlanSlugs"] {
  const valid = new Set(["free", "plus", "premium"]);
  const sanitized = (allowedPlanSlugs ?? []).filter((slug): slug is "free" | "plus" | "premium" => valid.has(slug));
  if (sanitized.length > 0) return sanitized;
  if (requiredPlan?.slug === "premium") return ["premium"];
  if (requiredPlan?.slug === "plus") return ["plus", "premium"];
  return ["free", "plus", "premium"];
}

async function getCachedPlans(supabase: any) {
  const now = nowMs();
  if (plansCache && plansCache.expiresAt > now) return plansCache.plans;

  const { data } = await supabase.from("plans").select("id,name,slug");
  const plans = data ?? [];
  plansCache = { plans, expiresAt: nowMs() + PLANS_CACHE_TTL_MS };
  return plans;
}

async function getCachedAudioFile(supabase: any, id: string) {
  const now = nowMs();
  const cached = audioFileCache.get(id);
  if (cached && cached.expiresAt > now) return cached.value;

  const { data } = await supabase
    .from("kit_audio_files")
    .select("id,kit_id,tone,name,r2_key,file_type,source_type")
    .eq("id", id)
    .maybeSingle();

  const value = (data ?? null) as CachedAudioFile | null;
  audioFileCache.set(id, { value, expiresAt: nowMs() + AUDIO_META_CACHE_TTL_MS });
  return value;
}

async function getCachedKit(supabase: any, kitId: string) {
  const now = nowMs();
  const cached = kitCache.get(kitId);
  if (cached && cached.expiresAt > now) return cached.value;

  const { data } = await supabase
    .from("kits")
    .select("id,slug,name,artist,cover_url,description,lyrics,required_plan,allowed_plan_slugs,original_tone,default_tone,allow_pitch_shift,max_pitch_shift_semitones")
    .eq("id", kitId)
    .maybeSingle();

  const value = (data ?? null) as CachedKit | null;
  kitCache.set(kitId, { value, expiresAt: nowMs() + KIT_META_CACHE_TTL_MS });
  return value;
}

async function resolveOpeningTone(supabase: any, kit: CachedKit) {
  const explicitTone = normalizeTone(kit.default_tone) ?? normalizeTone(kit.original_tone);
  if (explicitTone) return explicitTone;

  const { data } = await supabase.from("kit_audio_files").select("tone").eq("kit_id", kit.id);
  const tones = Array.from(new Set((data ?? []).map((row: any) => normalizeTone(row.tone)).filter(Boolean))) as string[];
  return sortTonesByChromaticOrder(tones)[0] ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const startedAt = nowMs();

  try {
    const supabase = createSupabaseAdminClient() as any;
    const [audioFile, context, plans] = await Promise.all([
      getCachedAudioFile(supabase, id),
      getCurrentUserAccessContext(),
      getCachedPlans(supabase),
    ]);

    if (!audioFile?.r2_key) {
      return NextResponse.json({ error: "Áudio não encontrado." }, { status: 404 });
    }

    const kit = await getCachedKit(supabase, audioFile.kit_id);
    if (!kit) {
      return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });
    }

    const requiredPlan = resolveRequiredPlan(plans, kit.required_plan);
    const accessKit: PublicKit = {
      id: kit.id,
      slug: kit.slug,
      name: kit.name,
      artist: kit.artist ?? "",
      coverUrl: kit.cover_url,
      description: kit.description,
      lyrics: kit.lyrics,
      originalTone: kit.original_tone ?? null,
      defaultTone: kit.default_tone ?? kit.original_tone ?? null,
      allowPitchShift: kit.allow_pitch_shift ?? true,
      maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,
      previewAudioFileId: null,
      previewStartSeconds: 0,
      previewDurationSeconds: 10,
      manualTessituraRanges: {},
      category: null,
      requiredPlan,
      allowedPlanSlugs: resolveAllowedPlanSlugs(kit.allowed_plan_slugs, requiredPlan),
      tones: [],
    };

    const access = await resolveKitAccess(context, accessKit);
    if (!access.play.allowed) {
      return NextResponse.json({ error: "Acesso negado a este áudio." }, { status: 403 });
    }

    if (!access.tone.allowed) {
      const openingTone = await resolveOpeningTone(supabase, kit);
      const requestedTone = normalizeTone(audioFile.tone);
      if (openingTone && requestedTone !== openingTone) {
        return NextResponse.json({ error: "Troca de tom indisponível para seu plano." }, { status: 403 });
      }
    }

    const signedUrl = await createSignedAudioUrl(audioFile.r2_key, SIGNED_AUDIO_TTL_SECONDS);
    const response = NextResponse.json({ url: signedUrl, expiresIn: SIGNED_AUDIO_TTL_SECONDS, ttfb: nowMs() - startedAt });
    response.headers.set("Cache-Control", "private, max-age=3540, stale-while-revalidate=60");
    return response;
  } catch (error) {
    console.warn("[audio:signed-url] failed", error);
    return NextResponse.json({ error: "Não foi possível preparar este áudio." }, { status: 500 });
  }
}
