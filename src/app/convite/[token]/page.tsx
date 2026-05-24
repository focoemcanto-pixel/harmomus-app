import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = (await createClient()) as any;
  const { data: invite } = await supabase.from("ministry_invites").select("*").eq("token", token).maybeSingle();
  if (!invite || invite.status !== "pending") return <main className="p-8 text-white">Convite inválido.</main>;
  if (new Date(invite.expires_at).getTime() < Date.now()) return <main className="p-8 text-white">Convite expirado.</main>;

  const context = await getCurrentUserAccessContext();
  if (context.isGuest || !context.profile) redirect(`/login?next=/convite/${token}`);

  await supabase.from("ministry_members").upsert({ ministry_id: invite.ministry_id, user_id: context.profile.id, role: invite.role, invited_by: invite.invited_by, joined_at: new Date().toISOString(), status: "active" }, { onConflict: "ministry_id,user_id" });
  await supabase.from("ministry_invites").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", invite.id);

  redirect("/ministerio");
}
