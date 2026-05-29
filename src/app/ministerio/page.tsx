import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, Mail, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";

import { MinistryOnboardingModal } from "@/components/public/ministry-onboarding-modal";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { canRequestSongsAndTones, ensureMinistryForSubscription, isMinistryPlanSlug } from "@/lib/data/ministry";
import { createClient } from "@/lib/supabase/server";

function statusLabel(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "active") return "Ativo";
  if (normalized === "pending") return "Pendente";
  if (normalized === "trialing") return "Em teste";
  if (normalized === "removed") return "Removido";
  return status || "—";
}

function planLabel(planType?: string | null) {
  if (planType === "ministry_40") return "Ministerial 40";
  if (planType === "ministry_20") return "Ministerial 20";
  if (planType === "ministry_10") return "Ministerial 10";
  return "Ministerial";
}

function isActiveSubscription(status?: string | null) {
  return ["active", "trialing"].includes(String(status ?? "").toLowerCase());
}

export default async function MinisterioPage() {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) redirect("/login");

  const planSlug = String(context.plan?.slug ?? "").trim().toLowerCase();

  if (!context.ministry && context.profile?.id && isMinistryPlanSlug(planSlug) && isActiveSubscription(context.subscription?.status)) {
    await ensureMinistryForSubscription({
      userId: context.profile.id,
      planSlug,
      subscriptionId: context.subscription?.id ?? null,
      stripeCustomerId: (context.subscription as any)?.stripe_customer_id ?? (context.subscription as any)?.gateway_customer_id ?? null,
      stripeSubscriptionId: (context.subscription as any)?.stripe_subscription_id ?? (context.subscription as any)?.gateway_subscription_id ?? null,
      status: context.subscription?.status ?? null,
      currentPeriodEnd: (context.subscription as any)?.current_period_end ?? null,
      trialEndsAt: (context.subscription as any)?.trial_ends_at ?? null,
    });

    redirect("/ministerio");
  }

  if (!context.ministry) redirect("/assinatura");

  const supabase = (await createClient()) as any;

  const [{ data: ministry }, { data: rawMembers }] = await Promise.all([
    supabase.from("ministries").select("*").eq("id", context.ministry.ministryId).single(),
    supabase
      .from("ministry_members")
      .select("id,user_id,role,status,invited_email,invited_name")
      .eq("ministry_id", context.ministry.ministryId)
      .neq("status", "removed")
      .order("created_at"),
  ]);

  const members = rawMembers ?? [];

  const activeSeats = members.filter((m: any) => ["active", "pending"].includes(m.status)).length;
  const pendingSeats = members.filter((m: any) => m.status === "pending").length;
  const remainingSeats = Math.max(0, Number(ministry?.seat_limit ?? 0) - activeSeats);
  const usagePercent = Math.min(100, Math.round((activeSeats / Number(ministry?.seat_limit || 1)) * 100));

  const canRequest = canRequestSongsAndTones({
    isAdmin: context.isAdmin,
    ministryRole: context.ministry.role,
    effectiveSlug: context.effectiveSlug,
  });

  const canManage = isMinistryManager(context);

  return (
    <PublicAppShell>
      {canManage ? <MinistryOnboardingModal ministryId={context.ministry.ministryId} remainingSeats={remainingSeats} /> : null}
      <main className="min-h-screen bg-gradient-to-b from-[#020617] via-[#060b1a] to-[#12051d] px-4 py-8 text-white md:px-8">
        <section className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120] via-[#140d27] to-[#06111f] p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                  <Crown className="h-4 w-4" /> Central Ministerial
                </div>

                <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{ministry?.name}</h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
                  Controle os acessos Premium da sua equipe de louvor em uma central exclusiva do Harmomus.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-200 md:min-w-[240px]">
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Plano</p>
                <p className="mt-2 text-2xl font-semibold text-cyan-100">{planLabel(ministry?.plan_type)}</p>
                <p className="mt-2 text-xs text-zinc-400">Status: {statusLabel(ministry?.status)}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <Users className="h-5 w-5 text-cyan-200" />
                <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">Vagas usadas</p>
                <p className="mt-2 text-3xl font-semibold">{activeSeats}/{ministry?.seat_limit}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <Sparkles className="h-5 w-5 text-fuchsia-200" />
                <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">Disponíveis</p>
                <p className="mt-2 text-3xl font-semibold">{remainingSeats}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <Mail className="h-5 w-5 text-amber-200" />
                <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">Pendentes</p>
                <p className="mt-2 text-3xl font-semibold">{pendingSeats}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <ShieldCheck className="h-5 w-5 text-emerald-200" />
                <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">Solicitações</p>
                <p className="mt-2 text-xl font-semibold">{canRequest ? "Liberadas" : "Restritas"}</p>
              </div>
            </div>

            <div className="mt-7 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400" style={{ width: `${usagePercent}%` }} />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <section id="convidar-integrante" className="scroll-mt-28 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Convidar integrante</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Os convidados terão acesso Premium ao Harmomus, mas apenas o responsável poderá solicitar novas músicas e tons.
                  </p>
                </div>

                <Link href="/assinatura" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200">
                  Gerenciar plano
                </Link>
              </div>

              {canManage ? (
                <form action="/api/ministerio/invite" method="post" className="mt-6 space-y-3">
                  <input
                    name="name"
                    placeholder="Nome do integrante"
                    className="h-12 w-full rounded-2xl border border-white/15 bg-black/25 px-4 text-sm text-white outline-none ring-cyan-300/30 focus:ring"
                  />

                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="email@integrante.com"
                    className="h-12 w-full rounded-2xl border border-white/15 bg-black/25 px-4 text-sm text-white outline-none ring-cyan-300/30 focus:ring"
                  />

                  <button
                    disabled={remainingSeats <= 0}
                    className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-400 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(34,211,238,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {remainingSeats <= 0 ? "Limite de vagas atingido" : "Enviar convite"}
                  </button>
                </form>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Integrantes</h2>
                  <p className="mt-1 text-sm text-zinc-400">Acompanhe os acessos Premium da equipe.</p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {members.map((member: any) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {member.invited_name || "Integrante"}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {member.invited_email}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                        {member.role === "owner" ? "Responsável" : "Membro"}
                      </span>

                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
                        {statusLabel(member.status)}
                      </span>

                      {canManage && member.role !== "owner" ? (
                        <form action="/api/ministerio/remove" method="post">
                          <input type="hidden" name="member_id" value={member.id} />

                          <button className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
