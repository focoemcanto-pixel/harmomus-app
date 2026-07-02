import { createClient } from "@/lib/supabase/server";

export type HomeFeaturedKit = {
  id: string;
  kit_id: string;
  order_index: number;
  active: boolean;
};

function isMissingTableError(error: unknown) {
  const maybeError = error as { code?: string; message?: string; details?: string } | null;
  const message = `${maybeError?.message ?? ""} ${maybeError?.details ?? ""}`.toLowerCase();

  return (
    maybeError?.code === "42P01" ||
    maybeError?.code === "PGRST205" ||
    (message.includes("home_featured_kits") &&
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find the table")))
  );
}

async function getClient() {
  return (await createClient()) as any;
}

export async function getPublicHomeFeaturedKitIds(limit = 5): Promise<string[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("home_featured_kits")
    .select("kit_id")
    .eq("active", true)
    .order("order_index", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(`Falha ao buscar kits em destaque: ${error.message}`);
  }

  return (data ?? []).map((row: any) => String(row.kit_id)).filter(Boolean);
}

export async function getAdminHomeFeaturedKits(): Promise<HomeFeaturedKit[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("home_featured_kits")
    .select("id,kit_id,order_index,active")
    .order("order_index", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(`Falha ao listar kits em destaque: ${error.message}`);
  }

  return (data ?? []) as HomeFeaturedKit[];
}

export async function replaceHomeFeaturedKits(kitIds: string[]) {
  const supabase = await getClient();
  const uniqueKitIds = Array.from(new Set(kitIds.map((id) => id.trim()).filter(Boolean))).slice(0, 5);

  const { error: deleteError } = await supabase.from("home_featured_kits").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) throw new Error(`Falha ao limpar kits em destaque: ${deleteError.message}`);

  if (!uniqueKitIds.length) return;

  const rows = uniqueKitIds.map((kitId, index) => ({
    kit_id: kitId,
    order_index: index + 1,
    active: true,
  }));

  const { error: insertError } = await supabase.from("home_featured_kits").insert(rows);
  if (insertError) throw new Error(`Falha ao salvar kits em destaque: ${insertError.message}`);
}
