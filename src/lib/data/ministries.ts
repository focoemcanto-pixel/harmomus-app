import { createClient } from "@/lib/supabase/server";

export type MinistryRole = "owner" | "manager" | "member";

export async function getUserMinistry(userId: string) {
  const supabase = (await createClient()) as any;
  const { data } = await supabase
    .from("ministry_members")
    .select("role,status,ministry:ministries(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data ?? null;
}

export async function getMinistryByOwner(ownerUserId: string) {
  const supabase = (await createClient()) as any;
  const { data } = await supabase.from("ministries").select("*").eq("owner_id", ownerUserId).maybeSingle();
  return data ?? null;
}

export async function countActiveMinistryMembers(ministryId: string) {
  const supabase = (await createClient()) as any;
  const { count } = await supabase.from("ministry_members").select("id", { count: "exact", head: true }).eq("ministry_id", ministryId).eq("status", "active");
  return count ?? 0;
}
