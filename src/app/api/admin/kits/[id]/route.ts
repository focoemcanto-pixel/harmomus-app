import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { ensureArtistCategory } from "@/lib/data/kits";
import { brazilianNoteToMidi } from "@/lib/music/brazilian-note";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DEFAULT_ALLOWED_PLANS = ["free", "plus", "premium"];
const TESSITURA_VOICES = ["tenor", "contralto", "soprano"] as const;
const OPTIONAL_KIT_COLUMNS = ["allowed_plan_slugs", "original_tone", "default_tone", "allow_pitch_shift", "max_pitch_shift_semitones", "manual_tessitura_ranges"] as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function parsePitchShiftLimit(value: unknown) {
  const parsed = Number(value ?? 2);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

function parseAllowedPlanSlugs(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_ALLOWED_PLANS;
  const selected = value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(selected.length ? selected : DEFAULT_ALLOWED_PLANS));
}

function resolveLegacyRequiredPlan(allowedPlanSlugs: string[]) {
  if (allowedPlanSlugs.includes("free")) return null;
  if (allowedPlanSlugs.includes("plus")) return "plus";
  if (allowedPlanSlugs.includes("premium")) return "premium";
  return null;
}

function parseManualTessituraRanges(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const ranges: Record<string, { min_midi: number; max_midi: number; source: "manual"; notation: "br" }> = {};

  for (const voice of TESSITURA_VOICES) {
    const range = (value as Record<string, { min?: unknown; max?: unknown }>)[voice];
    const minRaw = text(range?.min);
    const maxRaw = text(range?.max);
    if (!minRaw && !maxRaw) continue;
    if (!minRaw || !maxRaw) continue;

    const minMidi = brazilianNoteToMidi(minRaw);
    const maxMidi = brazilianNoteToMidi(maxRaw);
    if (typeof minMidi !== "number" || typeof maxMidi !== "number" || minMidi > maxMidi) continue;

    ranges[voice] = { min_midi: minMidi, max_midi: maxMidi, source: "manual", notation: "br" };
  }

  return Object.keys(ranges).length ? ranges : undefined;
}

function isMissingOptionalKitColumnError(message: string) {
  return OPTIONAL_KIT_COLUMNS.some((column) => message.includes(column));
}

function stripOptionalKitColumns<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload };
  for (const column of OPTIONAL_KIT_COLUMNS) delete next[column];
  return next;
}

async function updateKitWithFallback(supabase: any, id: string, payload: Record<string, unknown>) {
  async function run(data: Record<string, unknown>) {
    return supabase.from("kits").update(data).eq("id", id).select("*").maybeSingle();
  }

  const { data, error } = await run(payload);
  if (!error) return data;

  if (isMissingOptionalKitColumnError(error.message)) {
    const { data: fallbackData, error: fallbackError } = await run(stripOptionalKitColumns(payload));
    if (!fallbackError) return fallbackData;
    throw new Error(`Falha ao atualizar kit: ${fallbackError.message}`);
  }

  throw new Error(`Falha ao atualizar kit: ${error.message}`);
}

async function handleUpdate(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await getCurrentUserAccessContext();

    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;

    if (!id) return NextResponse.json({ error: "ID do kit é obrigatório." }, { status: 400 });
    if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

    const name = text(body.name);
    const slug = text(body.slug);
    const artist = text(body.artist);
    const originalTone = text(body.original_tone);
    const defaultTone = text(body.default_tone);
    const allowedPlanSlugs = parseAllowedPlanSlugs(body.allowed_plan_slugs);

    if (!name || !slug || !artist) {
      return NextResponse.json({ error: "Preencha nome, slug e artista para continuar." }, { status: 400 });
    }

    const artistCategory = await ensureArtistCategory(artist);
    const manualTessituraRanges = parseManualTessituraRanges(body.manual_tessitura);
    const supabase = createSupabaseAdminClient() as any;
    const payload: Record<string, unknown> = {
      name,
      slug,
      artist,
      description: text(body.description) || null,
      lyrics: text(body.lyrics) || null,
      cover_url: text(body.cover_url) || null,
      r2_folder: text(body.r2_folder) || null,
      category_id: text(body.category_id) || artistCategory.id,
      required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),
      allowed_plan_slugs: allowedPlanSlugs,
      original_tone: originalTone || null,
      default_tone: defaultTone || originalTone || null,
      allow_pitch_shift: Boolean(body.allow_pitch_shift),
      max_pitch_shift_semitones: parsePitchShiftLimit(body.max_pitch_shift_semitones),
      published: Boolean(body.published),
    };

    if (manualTessituraRanges) {
      payload.manual_tessitura_ranges = manualTessituraRanges;
    }

    const updated = await updateKitWithFallback(supabase, id, payload);

    if (!updated) {
      return NextResponse.json({ error: "Kit não encontrado para atualização." }, { status: 404 });
    }

    revalidatePath("/admin/kits", "page");
    revalidatePath("/admin/kits/novo", "page");
    revalidatePath("/biblioteca", "page");
    revalidatePath("/todos-os-kits", "page");
    revalidatePath(`/biblioteca/${slug}`, "page");

    return NextResponse.json({
      success: true,
      kit: updated,
      redirectTo: `/admin/kits/novo?importedKitId=${id}&savedAt=${Date.now()}#kit-editor`,
    });
  } catch (error) {
    console.error("[admin-kit-update] failed", error);
    const message = error instanceof Error ? error.message : "Erro inesperado ao salvar kit.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const PUT = handleUpdate;
export const PATCH = handleUpdate;
