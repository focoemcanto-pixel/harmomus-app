import { createClient } from "@/lib/supabase/server";
import { normalizePlan } from "@/lib/access/access-engine";

export async function getCurrentSubscription() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) return { isLoggedIn: false, planSlug: "free", hierarchyLevel: 1, subscriptionStatus: "guest" };

  const { data: subscription } = await (supabase as any)
    .from("subscriptions")
    .select("status, plan:plans(slug,hierarchy_level)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planSlug = normalizePlan(subscription?.plan?.slug);
  const hierarchyLevel = Number(subscription?.plan?.hierarchy_level ?? (planSlug === "premium" ? 3 : planSlug === "plus" ? 2 : 1));
  return {
    isLoggedIn: true,
    planSlug,
    hierarchyLevel,
    subscriptionStatus: String(subscription?.status ?? "none"),
  };
}
