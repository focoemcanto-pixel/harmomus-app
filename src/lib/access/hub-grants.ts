// Premium granted by the Foco em Canto HUB (hub_entitlement_grants). Independent from billing:
// any active, started and unexpired grant makes the user Premium, whatever the subscriptions say.
export function isHubGrantActive(grant: { status?: string | null; starts_at?: string | null; expires_at?: string | null } | null | undefined, now = new Date()) {
  if (!grant || grant.status !== "active") return false;
  const start = Date.parse(String(grant.starts_at ?? ""));
  const end = grant.expires_at ? Date.parse(grant.expires_at) : Infinity;
  return Number.isFinite(start) && start <= now.getTime() && end > now.getTime();
}

export async function activeHubPremiumGrant(admin: any, userId: string, now = new Date()) {
  const { data, error } = await admin
    .from("hub_entitlement_grants")
    .select("id,source,source_ref,status,starts_at,expires_at")
    .eq("user_id", userId)
    .eq("plan_slug", "premium")
    .eq("status", "active")
    .limit(20);
  if (error) return null; // missing table/permission never opens access
  return ((data ?? []) as any[]).find((grant) => isHubGrantActive(grant, now)) ?? null;
}
