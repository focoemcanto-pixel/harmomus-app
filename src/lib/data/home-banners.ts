import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type HomeBanner = Database["public"]["Tables"]["home_banners"]["Row"];

function isMissingTableError(error: unknown) {
  const maybeError = error as { code?: string; message?: string } | null;
  return maybeError?.code === "42P01" || maybeError?.message?.toLowerCase().includes("home_banners") && maybeError.message.toLowerCase().includes("does not exist");
}

export async function getAdminHomeBanners(): Promise<HomeBanner[]> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("home_banners").select("*").order("sort_order", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(`Falha ao listar banners: ${error.message}`);
  }
  return (data ?? []) as HomeBanner[];
}

export async function getPublicHomeBanners(): Promise<HomeBanner[]> {
  const supabase = (await createClient()) as any;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("home_banners")
    .select("*")
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("sort_order", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(`Falha ao buscar banners públicos: ${error.message}`);
  }
  return (data ?? []) as HomeBanner[];
}

export async function createHomeBanner(payload: Database["public"]["Tables"]["home_banners"]["Insert"]) {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("home_banners").insert(payload);
  if (error) throw new Error(`Falha ao criar banner: ${error.message}`);
}

export async function updateHomeBanner(id: string, payload: Database["public"]["Tables"]["home_banners"]["Update"]) {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("home_banners").update(payload).eq("id", id);
  if (error) throw new Error(`Falha ao atualizar banner: ${error.message}`);
}

export async function deleteHomeBanner(id: string) {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("home_banners").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir banner: ${error.message}`);
}
