import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type HomeSection = Database["public"]["Tables"]["home_sections"]["Row"];

function isMissingTableError(error: unknown) {
  const maybeError = error as { code?: string; message?: string; details?: string } | null;
  const message = `${maybeError?.message ?? ""} ${maybeError?.details ?? ""}`.toLowerCase();

  return (
    maybeError?.code === "42P01" ||
    maybeError?.code === "PGRST205" ||
    (message.includes("home_sections") &&
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find the table")))
  );
}

export async function getAdminHomeSections(): Promise<HomeSection[]> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("home_sections").select("*").order("order_index", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(`Falha ao listar blocos: ${error.message}`);
  }
  return (data ?? []) as HomeSection[];
}

export async function getPublicHomeSections(): Promise<HomeSection[]> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("home_sections").select("*").eq("active", true).order("order_index", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(`Falha ao listar blocos públicos: ${error.message}`);
  }
  return (data ?? []) as HomeSection[];
}

export async function createHomeSection(payload: Database["public"]["Tables"]["home_sections"]["Insert"]) {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("home_sections").insert(payload);
  if (error) throw new Error(`Falha ao criar bloco: ${error.message}`);
}

export async function updateHomeSection(id: string, payload: Database["public"]["Tables"]["home_sections"]["Update"]) {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("home_sections").update(payload).eq("id", id);
  if (error) throw new Error(`Falha ao atualizar bloco: ${error.message}`);
}

export async function deleteHomeSection(id: string) {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("home_sections").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir bloco: ${error.message}`);
}
