import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { ensureArtistCategory, updateKit } from "@/lib/data/kits";

const DEFAULT_ALLOWED_PLANS = ["free", "plus", "premium"];

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

    const updated = await updateKit(id, {
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
    } as any);

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
