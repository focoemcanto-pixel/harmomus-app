import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const PREMIUM_MONTHLY_KIT_SUGGESTION_LIMIT = 3;

export function getCurrentSuggestionMonthWindow() {
  const now = new Date();
  return {
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString(),
    periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0).toISOString(),
  };
}

export async function getPremiumKitSuggestionUsage(userId: string) {
  const { periodStart, periodEnd } = getCurrentSuggestionMonthWindow();
  const supabase = createSupabaseAdminClient() as any;

  const { count, error } = await supabase
    .from("premium_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("request_type", "song")
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  if (error) throw new Error(error.message || "Não foi possível validar o limite mensal.");

  const used = count ?? 0;
  return {
    used,
    limit: PREMIUM_MONTHLY_KIT_SUGGESTION_LIMIT,
    remaining: Math.max(0, PREMIUM_MONTHLY_KIT_SUGGESTION_LIMIT - used),
    periodStart,
    periodEnd,
  };
}
