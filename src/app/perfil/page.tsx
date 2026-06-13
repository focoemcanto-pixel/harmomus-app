import { redirect } from "next/navigation";

import { ProfilePageClient } from "@/components/public/profile-page-client";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function safeCount(query: PromiseLike<{ count: number | null; error?: unknown }>) {
  try {
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function isVerified(status?: string | null, verifiedAt?: string | null) {
  const value = String(status ?? "").trim().toLowerCase();
  return Boolean(verifiedAt) || value === "active" || value === "email_confirmed" || value === "onboarding_completed";
}

export default async function PerfilPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");

  const supabase = createSupabaseAdminClient() as any;
  const userId = context.profile?.id ?? "";
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString();
  const localStatus = String((context.profile as any)?.onboarding_status ?? "");
  const emailVerifiedAt = String((context.profile as any)?.email_verified_at ?? "");
  const pendingEmail = String((context.profile as any)?.pending_email ?? "");

  const [playlists, favorites, kitsToday, history] = await Promise.all([
    safeCount((supabase as any).from("playlists").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    safeCount((supabase as any).from("kit_favorites").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    safeCount((supabase as any).from("audio_access_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "allowed").gte("accessed_at", start)),
    safeCount((supabase as any).from("audio_access_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "allowed")),
  ]);

  return <PublicAppShell><ProfilePageClient
    userId={userId}
    initialName={context.profile?.full_name ?? "Sem nome"}
    email={context.profile?.email ?? "Sem e-mail"}
    pendingEmail={pendingEmail || null}
    username={(context.profile?.email ?? "user").split("@")[0]}
    avatarUrl={context.profile?.avatar_url ?? null}
    planName={context.plan?.name ?? "Free"}
    subscriptionStatus={context.subscription?.status ?? "inactive"}
    emailConfirmed={isVerified(localStatus, emailVerifiedAt)}
    stats={{ playlists, favorites, history, kitsToday }}
  /></PublicAppShell>;
}
