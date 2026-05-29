import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, Mail, ShieldCheck, Sparkles, Users } from "lucide-react";

import { MinistryInviteCard } from "@/components/ministerio/ministry-invite-card";
import { MinistryMembersTable } from "@/components/ministerio/ministry-members-table";
import { MinistryShell, planLabel, PremiumPanel, statusLabel } from "@/components/ministerio/ministry-ui";
import { MinistryOnboardingModal } from "@/components/public/ministry-onboarding-modal";
import { getCurrentUserAccessContext, isMinistryManager, isMinistryOwner } from "@/lib/auth/current-user";
import { canRequestSongsAndTones, ensureMinistryForSubscription, getMinistrySeatLimit, isMinistryPlanSlug } from "@/lib/data/ministry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MinisterioSearchParams = {
  message?: string | string[];
};

function isActiveSubscription(status?: string | null) {
  return ["active", "trialing"].includes(String(status ?? "").toLowerCase());
}

function metric(label: string, value: string | number, icon: React.ReactNode, hint?: string) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-cyan-200">{icon}</div>
      <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-2 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function messageTone(message?: string | null) {
  const value = String(message ?? "").toLowerCase();
  if (!value) return null;
  if (value.includes("sucesso") || value.includes("criado") || value.includes("reenviado") || value.includes("removido")) return "success";
  return "warning";
}

function normalizeMessage(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function MinisterioPage({ searchParams }: { searchParams?: Promise<MinisterioSearchParams> }) {
  const [context, resolvedSearchParams] = await Promise.all([
    getCurrentUserAccessContext(),
    searchParams ?? Promise.resolve({} as MinisterioSearchParams),
  ]);

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

  const supabase = createSupabaseAdminClient() as any;
  const [{ data: ministry }, { data: rawMembers }] = await Promise.all([
    supabase.from("ministries").select("*").eq("id", context.ministry.ministryId).single(),
    supabase
      .from("ministry_members")
      .select("id,ministry_id,user_id,role,status,invited_email,invited_name,invite_token,invited_at,accepted_at,removed_at,created_at,updated_at")
      .eq("ministry_id", context.ministry.ministryId)
      .order("created_at", { ascending: true }),
  ]);

  const members = rawMembers ?? [];
  const ministryPlanType = String(ministry?.plan_type ?? context.ministry.planType ?? planSlug ?? "").trim().toLowerCase();
  const seatLimit = Number(ministry?.seat_limit ?? 0) || Number(context.ministry.seatLimit ?? 0) || getMinistrySeatLimit(ministryPlanType);
  const usedSeats = members.filter((member: any) => ["active", "pending", "invited"].includes(String(member.status))).length;
  const activeMembers = members.filter((member: any) => String(member.status) === "active").length;
  const pendingInvites = members.filter((member: any) => ["pending", "invited"].includes(String(member.status))).length;
  const remainingSeats = Math.max(0, seatLimit - usedSeats);
  const usagePercent = seatLimit > 0 ? Math.min(100, Math.round((usedSeats / seatLimit) * 100)) : 0;
  const canManage = isMinistryManager(context);
  const canRemove = isMinistryOwner(context);
  const canRequest = canRequestSongsAndTones({ isAdmin: context.isAdmin, ministryRole: context.ministry.role, effectiveSlug: context.effectiveSlug });
  const message = normalizeMessage(resolvedSearchParams.message);
  const tone = messageTone(message);

  return (
    <>
      {canManage ? <MinistryOnboardingModal ministryId={context.ministry.ministryId} remainingSeats={remainingSeats} /> : null}
      <MinistryShell>
        {message ? (
          <div className={`rounded-[1.5rem] border p-4 text-sm shadow-[0_20px_70px_rgba(0,0,0,0.22)] ${tone === "success" ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100" : "border-amber-300/25 bg-amber-500/10 text-amber-100"}`}>
            {message}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                <Crown className="h-4 w-4" /> Central Ministerial Premium
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{ministry?.name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
                Um plano compartilhado premium para sua equipe de louvor: acessos, convites, permissões e acompanhamento em um só lugar.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-200 md:min-w-[240px]">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Plano</p>
              <p className="mt-2 text-2xl font-semibold text-cyan-100">{planLabel(ministryPlanType)}</p>
              <p className="mt-2 text-xs text-zinc-400">Status: {statusLabel(ministry?.status)}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {metric("Plano", planLabel(ministryPlanType), <Crown className="h-5 w-5" />, statusLabel(ministry?.status))}
            {metric("Vagas", `${usedSeats}/${seatLimit}`, <Users className="h-5 w-5" />, `${remainingSeats} livres`)}
            {metric("Convites pendentes", pendingInvites, <Mail className="h-5 w-5" />, "Pendentes + convidados")}
            {metric("Integrantes ativos", activeMembers, <Sparkles className="h-5 w-5" />, "Acessos aceitos")}
          </div>
          <div className="mt-7 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400" style={{ width: `${usagePercent}%` }} /></div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <MinistryInviteCard canManage={canManage} remainingSeats={remainingSeats} />
          <PremiumPanel id="permissoes">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-emerald-100"><ShieldCheck className="h-5 w-5" /></div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Permissões</p>
                <h2 className="mt-2 text-2xl font-semibold">Solicitações centralizadas</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Apenas administradores Harmomus e o responsável do ministério podem solicitar novas músicas e novos tons. Integrantes mantêm o acesso Premium aos kits, sem abrir pedidos.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {canRequest ? <Link href="/area-premium#solicitacoes" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">Abrir solicitações</Link> : null}
                  <Link href="/todos-os-kits" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10">Ver kits</Link>
                </div>
              </div>
            </div>
          </PremiumPanel>
        </div>

        <MinistryMembersTable members={members} canRemove={canRemove} canManage={canManage} ministryName={ministry?.name ?? "Ministério"} />
      </MinistryShell>
    </>
  );
}
