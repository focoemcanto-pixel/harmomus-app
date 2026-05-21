import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type Plan = Database["public"]["Tables"]["plans"]["Row"];

export async function getPlans(): Promise<Plan[]> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("plans").select("*").order("hierarchy_level", { ascending: true });
  if (error) throw new Error(`Falha ao listar planos: ${error.message}`);
  return (data ?? []) as Plan[];
}

export async function getPlanById(id: string): Promise<Plan | null> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("plans").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao buscar plano: ${error.message}`);
  return (data as Plan | null) ?? null;
}

export async function createPlan(payload: Database["public"]["Tables"]["plans"]["Insert"]): Promise<Plan> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("plans").insert(payload).select("*").single();
  if (error) throw new Error(`Falha ao criar plano: ${error.message}`);
  return data as Plan;
}

export async function updatePlan(id: string, payload: Database["public"]["Tables"]["plans"]["Update"]): Promise<Plan> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("plans").update(payload).eq("id", id).select("*").single();
  if (error) throw new Error(`Falha ao atualizar plano: ${error.message}`);
  return data as Plan;
}

export async function togglePlanStatus(id: string, status: "active" | "inactive"): Promise<Plan> {
  return updatePlan(id, { status, updated_at: new Date().toISOString() });
}
