import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, ShieldCheck, Users } from "lucide-react";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function statusLabel(status?: string | null) {
  if (status === "pending") return "Convite pendente";
  if (status === "active") return "Convite aceito";
  if (status === "expired") return "Convite expirado";
  return status || "Convite";
}

export default async function MinisterioInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, context] = await Promise.all([params, getCurrentUserAccessContext()]);
  const admin = createSupabaseAdminClient() as any;

  const { data: invite } = await admin
    .from("ministry_members")
    .select("*, ministry:ministries(id,name,plan_type,seat_limit,status)")
    .eq("invite_token", token)
    .maybeSingle();

  if (!invite?.id || invite.status === "removed") {
    return (
      <PublicAppShell>
        <main className="min-h-screen bg-gradient-to-b from-[#020617] via-[#070b1c] to-[#12051d] px-4 py-10 text-white">
          <section className="mx-auto max-w-3xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_30px_100px_rgba(244,63,94,0.12)]">
            <p className="text-xs uppercase tracking-[0.22em] text-rose-200">Convite ministerial</p>
            <h1 className="mt-4 text-3xl font-semibold">Convite não encontrado</h1>
            <p className="mt-3 text-sm text-zinc-300">Este convite pode ter sido removido, expirado ou substituído por outro convite mais recente.</p>
            <Link href="/" className="mt-6 inline-flex rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">Voltar ao Harmomus</Link>
          </section>
        </main>
      </PublicAppShell>
    );
  }

  const inviteEmail = String(invite.invited_email ?? "").toLowerCase();
  const currentEmail = String(context.profile?.email ?? "").toLowerCase();
  const isLoggedInRightUser = Boolean(context.profile?.id && currentEmail === inviteEmail);
  const nextUrl = `/convite-ministerio/${token}`;

  if (invite.status === "active" && isLoggedInRightUser) {
    redirect("/");
  }

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#020617] via-[#060b1a] to-[#12051d] px-4 py-10 text-white md:px-8">
        <section className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120] via-[#140d27] to-[#06111f] p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
            <Crown className="h-4 w-4" /> Convite Ministerial
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Você foi convidado para o Harmomus Premium</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
            Seu ministério está liberando um acesso Premium para você estudar nipes, tons e kits vocais dentro do Harmomus.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <Users className="h-5 w-5 text-cyan-200" />
              <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">Ministério</p>
              <p className="mt-2 text-xl font-semibold">{invite.ministry?.name ?? "Ministério"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <ShieldCheck className="h-5 w-5 text-emerald-200" />
              <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">Permissão</p>
              <p className="mt-2 text-xl font-semibold">Premium de membro</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <Crown className="h-5 w-5 text-fuchsia-200" />
              <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">Status</p>
              <p className="mt-2 text-xl font-semibold">{statusLabel(invite.status)}</p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
            <h2 className="text-lg font-semibold">Importante</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Este acesso é pessoal e vinculado ao e-mail <strong className="text-white">{invite.invited_email}</strong>. Integrantes convidados têm acesso Premium aos kits, mas não podem solicitar novas músicas nem novos tons.
            </p>
          </div>

          {!context.profile?.id ? (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/login?redirect=${encodeURIComponent(nextUrl)}`} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">Entrar e aceitar</Link>
              <Link href={`/cadastro?plan=free&redirect=${encodeURIComponent(nextUrl)}&email=${encodeURIComponent(invite.invited_email)}`} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white">Criar conta</Link>
            </div>
          ) : !isLoggedInRightUser ? (
            <div className="mt-8 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-5 text-sm text-amber-100">
              Você está logado com outro e-mail. Entre com <strong>{invite.invited_email}</strong> para aceitar este convite.
            </div>
          ) : (
            <form action="/api/ministerio/accept" method="post" className="mt-8">
              <input type="hidden" name="token" value={token} />
              <button className="rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(34,211,238,0.2)]">
                Aceitar convite e liberar acesso
              </button>
            </form>
          )}
        </section>
      </main>
    </PublicAppShell>
  );
}
