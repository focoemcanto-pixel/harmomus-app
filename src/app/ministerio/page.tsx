import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, Mail, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";

import { MinistryOnboardingModal } from "@/components/public/ministry-onboarding-modal";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { canRequestSongsAndTones, ensureMinistryForSubscription, getMinistrySeatLimit, isMinistryPlanSlug } from "@/lib/data/ministry";
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
  const ministryPlanType = String(ministry?.plan_type ?? context.ministry.planType ?? planSlug ?? "").trim().toLowerCase();
  const seatLimit = Number(ministry?.seat_limit ?? 0) || Number(context.ministry.seatLimit ?? 0) || getMinistrySeatLimit(ministryPlanType);

  const activeSeats = members.filter((m: any) => ["active", "pending", "invited"].includes(String(m.status))).length;
  const pendingSeats = members.filter((m: any) => ["pending", "invited"].includes(String(m.status))).length;
  const remainingSeats = Math.max(0, seatLimit - activeSeats);
  const usagePercent = seatLimit > 0 ? Math.min(100, Math.round((activeSeats / seatLimit) * 100)) : 0;

  const canRequest = canRequestSongsAndTones({
    isAdmin: context.isAdmin,
    ministryRole: context.ministry.role,
    effectiveSlug: context.effectiveSlug,
  });

  const canManage = isMinistryManager(context);

  return (
    <>
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
                <p className="mt-2 text-2xl font-semibold text-cyan-100">{planLabel(ministryPlanType)}</p>
                <p className="mt-2 text-xs text-zinc-400">Status: {statusLabel(ministry?.status)}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <Users className="h-5 w-5 text-cyan-200" />
                <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">Vagas usadas</p>
                <p className="mt-2 text-3xl font-semibold">{activeSeats}/{seatLimit}</p>
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
        </section>
      </main>
    </>
  );
}
