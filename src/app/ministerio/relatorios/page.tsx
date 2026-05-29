import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, Mail, PieChart, UserCheck, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MinisterioRelatoriosPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context) && !context.isAdmin) redirect("/ministerio");

  const admin = createSupabaseAdminClient() as any;
  const [{ data: ministry }, { data: members }] = await Promise.all([
    admin.from("ministries").select("id,seat_limit,plan_type,status").eq("id", context.ministry.ministryId).single(),
    admin.from("ministry_members").select("id,status").eq("ministry_id", context.ministry.ministryId),
  ]);

  const rows = members ?? [];
  const seatLimit = Number(ministry?.seat_limit ?? context.ministry.seatLimit ?? 0);
  const usedSeats = rows.filter((member: any) => ["active", "pending", "invited"].includes(String(member.status))).length;
  const remainingSeats = Math.max(0, seatLimit - usedSeats);
  const invitesSent = rows.filter((member: any) => ["active", "pending", "invited", "removed"].includes(String(member.status))).length;
  const invitesAccepted = rows.filter((member: any) => String(member.status) === "active").length;
  const pendingInvites = rows.filter((member: any) => ["pending", "invited"].includes(String(member.status))).length;
  const activeMembers = invitesAccepted;
  const occupancyRate = seatLimit > 0 ? Math.round((usedSeats / seatLimit) * 100) : 0;

  return (
    <MinistryShell>
      <div className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <BarChart3 className="h-4 w-4" /> Relatórios Ministeriais
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Saúde do plano</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">Ocupação, convites e uso das vagas contratadas em tempo real.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ReportCard icon={<Users />} label="Vagas contratadas" value={seatLimit} />
        <ReportCard icon={<UserCheck />} label="Vagas utilizadas" value={usedSeats} />
        <ReportCard icon={<CheckCircle2 />} label="Vagas livres" value={remainingSeats} />
        <ReportCard icon={<PieChart />} label="Taxa de ocupação" value={`${occupancyRate}%`} />
      </div>

      <PremiumPanel>
        <h2 className="text-2xl font-semibold">Funil de convites</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ReportCard icon={<Mail />} label="Convites enviados" value={invitesSent} compact />
          <ReportCard icon={<CheckCircle2 />} label="Convites aceitos" value={invitesAccepted} compact />
          <ReportCard icon={<Mail />} label="Convites pendentes" value={pendingInvites} compact />
        </div>
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center justify-between text-sm"><span className="text-zinc-300">Membros ativos</span><strong className="text-white">{activeMembers}</strong></div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-fuchsia-400" style={{ width: `${Math.min(100, occupancyRate)}%` }} /></div>
        </div>
      </PremiumPanel>
    </MinistryShell>
  );
}

function ReportCard({ icon, label, value, compact = false }: { icon: React.ReactNode; label: string; value: string | number; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.045] ${compact ? "p-4" : "p-5"} shadow-[0_20px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl`}>
      <div className="h-5 w-5 text-cyan-200">{icon}</div>
      <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}
