import { redirect } from "next/navigation";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient() as any;

  const { data: invite } = await admin
    .from("ministry_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.status !== "pending") {
    return <main className="min-h-screen bg-slate-950 p-8 text-white">Convite inválido.</main>;
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await admin.from("ministry_invites").update({ status: "expired" }).eq("id", invite.id);
    await admin
      .from("ministry_members")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("ministry_id", invite.ministry_id)
      .eq("invite_token", token)
      .eq("status", "pending");

    return <main className="min-h-screen bg-slate-950 p-8 text-white">Convite expirado.</main>;
  }

  const context = await getCurrentUserAccessContext();
  if (context.isGuest || !context.profile) redirect(`/login?next=/convite/${token}`);

  const now = new Date().toISOString();
  const profileEmail = String((context.profile as any)?.email ?? "").trim().toLowerCase();
  const invitedEmail = String(invite.email ?? "").trim().toLowerCase();

  if (profileEmail && invitedEmail && profileEmail !== invitedEmail) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Este convite foi enviado para outro e-mail. Entre com a conta correta para aceitar o acesso ministerial.
      </main>
    );
  }

  const memberPayload = {
    ministry_id: invite.ministry_id,
    user_id: context.profile.id,
    invited_email: invitedEmail,
    invited_name: (context.profile as any)?.full_name ?? null,
    role: invite.role,
    status: "active",
    invite_token: token,
    invited_by: invite.invited_by,
    accepted_at: now,
    updated_at: now,
  };

  const { data: pendingMember } = await admin
    .from("ministry_members")
    .select("id")
    .eq("ministry_id", invite.ministry_id)
    .eq("invite_token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingMember?.id) {
    const { error: memberUpdateError } = await admin
      .from("ministry_members")
      .update(memberPayload)
      .eq("id", pendingMember.id);

    if (memberUpdateError) {
      return <main className="min-h-screen bg-slate-950 p-8 text-white">Não foi possível ativar seu acesso.</main>;
    }
  } else {
    const { error: memberUpsertError } = await admin
      .from("ministry_members")
      .upsert(
        { ...memberPayload, created_at: now, invited_at: now },
        { onConflict: "ministry_id,user_id" },
      );

    if (memberUpsertError) {
      return <main className="min-h-screen bg-slate-950 p-8 text-white">Não foi possível ativar seu acesso.</main>;
    }
  }

  await admin
    .from("ministry_invites")
    .update({ status: "accepted", accepted_at: now })
    .eq("id", invite.id);

  redirect("/ministerio");
}
