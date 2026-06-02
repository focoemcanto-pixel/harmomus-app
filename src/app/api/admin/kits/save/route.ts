import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DEFAULT_ALLOWED_PLANS = ["free", "plus", "premium"];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function parsePitchShiftLimit(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 2);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

function parseAllowedPlanSlugs(formData: FormData, validPlanSlugs: string[]) {
  const valid = new Set(validPlanSlugs);
  const selected = formData
    .getAll("allowed_plan_slugs")
    .map((value) => String(value).trim().toLowerCase())
    .filter((value) => valid.has(value));

  return Array.from(new Set(selected.length ? selected : DEFAULT_ALLOWED_PLANS));
}

function resolveLegacyRequiredPlan(allowedPlanSlugs: string[]) {
  if (allowedPlanSlugs.includes("free")) return null;
  if (allowedPlanSlugs.includes("plus")) return "plus";
  if (allowedPlanSlugs.includes("premium")) return "premium";
  return null;
}

async function ensureArtistCategoryAdmin(supabase: any, artistName: string) {
  const name = artistName.trim();
  if (!name) throw new Error("Artista é obrigatório.");

  const slug = slugify(name);
  const { data: existing, error: existingError } = await supabase.from("categories").select("id,name,slug").eq("slug", slug).maybeSingle();
  if (existingError) throw new Error(`Falha ao buscar categoria automática: ${existingError.message}`);
  if (existing) return existing;

  const { data, error } = await supabase.from("categories").insert({ name, slug }).select("id,name,slug").single();
  if (error) throw new Error(`Falha ao criar categoria automática: ${error.message}`);
  return data;
}

export async function PATCH(request: Request) {
  try {
    const current = await getCurrentUserAccessContext();
    if (current.isGuest) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
    if (!current.isAdmin) return NextResponse.json({ error: "Apenas administradores podem salvar kits." }, { status: 403 });

    const formData = await request.formData();
    const kitId = String(formData.get("kit_id") ?? "").trim();
    if (!kitId) return NextResponse.json({ error: "Kit inválido." }, { status: 400 });

    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();
    const originalTone = String(formData.get("original_tone") ?? "").trim();
    const defaultTone = String(formData.get("default_tone") ?? "").trim();

    if (!name || !slug || !artist) {
      return NextResponse.json({ error: "Preencha nome, slug e artista para continuar." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient() as any;

    const { data: currentKit, error: currentKitError } = await supabase.from("kits").select("id").eq("id", kitId).maybeSingle();
    if (currentKitError) throw new Error(currentKitError.message);
    if (!currentKit?.id) return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });

    const { data: plans, error: plansError } = await supabase.from("plans").select("slug");
    if (plansError) throw new Error(`Falha ao buscar planos: ${plansError.message}`);

    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, (plans ?? []).map((plan: { slug: string }) => plan.slug));
    const artistCategory = await ensureArtistCategoryAdmin(supabase, artist);

    const payload = {
      name,
      slug,
      artist,
      description: String(formData.get("description") ?? "").trim() || null,
      lyrics: String(formData.get("lyrics") ?? "").trim() || null,
      cover_url: String(formData.get("cover_url") ?? "").trim() || null,
      r2_folder: String(formData.get("r2_folder") ?? "").trim() || null,
      category_id: String(formData.get("category_id") ?? "") || artistCategory.id,
      required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),
      allowed_plan_slugs: allowedPlanSlugs,
      original_tone: originalTone || null,
      default_tone: defaultTone || originalTone || null,
      allow_pitch_shift: formData.has("allow_pitch_shift"),
      max_pitch_shift_semitones: parsePitchShiftLimit(formData.get("max_pitch_shift_semitones")),
      published: formData.get("published") === "on",
    };

    const { data: updatedKit, error } = await supabase.from("kits").update(payload).eq("id", kitId).select("id,name,slug,published").single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, kit: updatedKit }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao salvar kit.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
