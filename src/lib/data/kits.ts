import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { KitAudioToneGroup } from "@/types/kit-audio";

export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type Kit = Database["public"]["Tables"]["kits"]["Row"];

export interface KitListItem extends Kit {
  category_name: string | null;
  tone_count: number;
  file_count: number;
}

export async function getKits(): Promise<KitListItem[]> {
  const supabase = (await createClient()) as any;
  const [{ data: kits, error: kitsError }, { data: categories, error: categoriesError }, { data: audioFiles, error: audioFilesError }] = await Promise.all([
    supabase.from("kits").select("*").order("created_at", { ascending: false }),
    supabase.from("categories").select("id,name"),
    supabase.from("kit_audio_files").select("kit_id,tone"),
  ]);
  if (kitsError) throw new Error(`Falha ao buscar kits: ${kitsError.message}`);
  if (categoriesError) throw new Error(`Falha ao buscar categorias: ${categoriesError.message}`);
  if (audioFilesError) throw new Error(`Falha ao buscar áudios sincronizados: ${audioFilesError.message}`);
  const categoriesMap = new Map(((categories ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const audioStats = new Map<string, { tones: Set<string>; count: number }>();
  for (const row of (audioFiles ?? []) as { kit_id: string; tone: string }[]) {
    if (!audioStats.has(row.kit_id)) audioStats.set(row.kit_id, { tones: new Set(), count: 0 });
    const stats = audioStats.get(row.kit_id)!;
    stats.tones.add(row.tone);
    stats.count += 1;
  }
  return ((kits ?? []) as Kit[]).map((kit) => {
    const stats = audioStats.get(kit.id);
    return {
      ...kit,
      category_name: kit.category_id ? categoriesMap.get(kit.category_id) ?? null : null,
      tone_count: stats?.tones.size ?? 0,
      file_count: stats?.count ?? 0,
    };
  });
}

export async function getKitById(id: string): Promise<Kit | null> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("kits").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao buscar kit: ${error.message}`);
  return (data as Kit | null) ?? null;
}

export async function createKit(data: Database["public"]["Tables"]["kits"]["Insert"]): Promise<Kit> {
  const supabase = (await createClient()) as any;
  const { data: created, error } = await supabase.from("kits").insert(data).select("*").single();
  if (error) throw new Error(`Falha ao criar kit: ${error.message}`);
  return created as Kit;
}

export async function updateKit(id: string, data: Database["public"]["Tables"]["kits"]["Update"]): Promise<Kit> {
  const supabase = (await createClient()) as any;
  const { data: updated, error } = await supabase.from("kits").update(data).eq("id", id).select("*").single();
  if (error) throw new Error(`Falha ao atualizar kit: ${error.message}`);
  return updated as Kit;
}

export async function deleteKit(id: string): Promise<void> {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("kits").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover kit: ${error.message}`);
}

export async function getKitFormOptions(): Promise<{ categories: Category[]; plans: Plan[] }> {
  const supabase = (await createClient()) as any;
  const [{ data: categories, error: categoriesError }, { data: plans, error: plansError }] = await Promise.all([
    supabase.from("categories").select("*").order("name"),
    supabase.from("plans").select("*").eq("active", true).order("price_cents"),
  ]);
  if (categoriesError) throw new Error(`Falha ao buscar categorias: ${categoriesError.message}`);
  if (plansError) throw new Error(`Falha ao buscar planos: ${plansError.message}`);
  return { categories: (categories ?? []) as Category[], plans: (plans ?? []) as Plan[] };
}


export async function saveKitAudioSync(kitId: string, tones: KitAudioToneGroup[]): Promise<void> {
  const supabase = (await createClient()) as any;

  const rows = tones.flatMap((toneGroup) =>
    toneGroup.files.map((file) => ({
      kit_id: kitId,
      tone: toneGroup.tone,
      name: file.name,
      r2_key: file.key,
      public_url: file.url,
      file_type: file.fileType,
    })),
  );

  const { error: deleteError } = await supabase.from("kit_audio_files").delete().eq("kit_id", kitId);
  if (deleteError) throw new Error(`Falha ao limpar áudios antigos: ${deleteError.message}`);

  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from("kit_audio_files").insert(rows);
  if (insertError) throw new Error(`Falha ao salvar áudios sincronizados: ${insertError.message}`);
}
