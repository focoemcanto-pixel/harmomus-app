import { createClient } from "@/lib/supabase/server";

export async function countActiveMinistryMembers(ministryId: string) {
  const supabase = (await createClient()) as any;
  const { count } = await supabase.from("ministry_members").select("id", { count: "exact", head: true }).eq("ministry_id", ministryId).eq("status", "active");
  return count ?? 0;
}
