import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, Headphones, Mail, MessageSquare, Music2, PieChart, UserCheck, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RankedItem = { label: string; value: number };

function topN(map: Map<string, number>, limit = 5): RankedItem[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function BlockList({ title, data }: { title: string; data: RankedItem[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <h3 className="text-sm font-semibold text-cyan-100">{title}</h3>
      {data.length ? (
        <div className="mt-4 space-y-3">
          {data.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-zinc-300">
                <span className="truncate">{item.label}</span>
                <strong className="text-white">{item.value}</strong>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-fuchsia-400" style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">Ainda não há dados suficientes.</p>
      )}
    </div>
  );
}

export default async function MinisterioRelatoriosPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context) && !context.isAdmin) redirect("/ministerio");

  const admin = createSupabaseAdminClient() as any;
  const ministryId = context.ministry.ministryId;
  const [{ data: ministry }, { data: members }, { data: requests }] = await Promise.all([
    admin.from("ministries").select("id,seat_limit,plan_type,status").eq("id", ministryId).single(),
    admin.from("ministry_members").select("id,user_id,invited_name,invited_email,status,role,created_at,accepted_at").eq("ministry_id", ministryId),
    admin.from("premium_requests").select("id,request_type,status,created_at").eq("ministry_id", ministryId),
  ]);

  const rows = members ?? [];
  const memberUserIds = rows.map((member: any) => member.user_id).filter(Boolean);
  const activeUserIds = rows.filter((member: any) => String(member.status) === "active").map((member: any) => member.user_id).filter(Boolean);
  const memberNameByUserId = new Map<string, string>();
  rows.forEach((member: any) => {
    if (!member.user_id) return;
    memberNameByUserId.set(member.user_id, member.invited_name || member.invited_email || member.user_id);
  });

  const [{ data: audioLogs }, { data: gateViews }] = await Promise.all([
    memberUserIds.length
      ? admin
          .from("audio_access_logs")
          .select("user_id,status,kit_id,kits(name)")
          .in("user_id", memberUserIds)
          .eq("status", "allowed")
          .order("accessed_at", { ascending: false })
          .limit(5000)
      : Promise.resolve({ data: [] }),
    memberUserIds.length
      ? admin
          .from("usage_tracking")
          .select("user_id,action,metadata,created_at")
          .in("user_id", memberUserIds)
          .eq("action", "premium_gate_viewed")
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ]);

  const seatLimit = Number(ministry?.seat_limit ?? context.ministry.seatLimit ?? 0);
  const usedSeats = rows.filter((member: any) => ["active", "pending", "invited"].includes(String(member.status))).length;
  const remainingSeats = Math.max(0, seatLimit - usedSeats);
  const invitesSent = rows.filter((member: any) => ["active", "pending", "invited", "removed"].includes(String(member.status))).length;
  const invitesAccepted = rows.filter((member: any) => String(member.status) === "active").length;
  const pendingInvites = rows.filter((member: any) => ["pending", "invited"].includes(String(member.status))).length;
  const activeMembers = invitesAccepted;
  const occupancyRate = seatLimit > 0 ? Math.round((usedSeats / seatLimit) * 100) : 0;

  const ministryRequests = requests ?? [];
  const requestSongs = ministryRequests.filter((item: any) => item.request_type === "song").length;
  const requestTones = ministryRequests.filter((item: any) => item.request_type === "tone").length;
  const openRequests = ministryRequests.filter((item: any) => ["pending", "reviewing", "approved", "new", "in_review"].includes(String(item.status))).length;

  const plays = audioLogs ?? [];
  const playsByKit = new Map<string, number>();
  const playsByUser = new Map<string, number>();
  plays.forEach((log: any) => {
    const kitName = log.kits?.name || log.kit_id || "Kit não informado";
    const userName = memberNameByUserId.get(log.user_id) || log.user_id || "Membro não informado";
    playsByKit.set(kitName, (playsByKit.get(kitName) ?? 0) + 1);
    playsByUser.set(userName, (playsByUser.get(userName) ?? 0) + 1);
  });

  const gateCount = (gateViews ?? []).length;
  const activeEngagedMembers = new Set(plays.map((log: any) => log.user_id).filter(Boolean)).size;
  const engagementRate = activeUserIds.length ? Math.round((activeEngagedMembers / activeUserIds.length) * 100) : 0;

  return (
    <MinistryShell>
      <div className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <BarChart3 className="h-4 w-4" /> Relatórios Ministeriais
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Saúde do ministério</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">Ocupação, convites, solicitações e consumo real dos kits pelos membros do plano.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ReportCard icon={<Users />} label="Vagas contratadas" value={seatLimit} />
        <ReportCard icon={<UserCheck />} label="Vagas utilizadas" value={usedSeats} />
        <ReportCard icon={<CheckCircle2 />} label="Vagas livres" value={remainingSeats} />
        <ReportCard icon={<PieChart />} label="Taxa de ocupação" value={`${occupancyRate}%`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ReportCard icon={<Headphones />} label="Plays dos membros" value={plays.length} />
        <ReportCard icon={<Users />} label="Membros engajados" value={`${activeEngagedMembers}/${activeMembers}`} />
        <ReportCard icon={<PieChart />} label="Taxa de engajamento" value={`${engagementRate}%`} />
        <ReportCard icon={<BarChart3 />} label="Gates premium vistos" value={gateCount} />
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

      <PremiumPanel>
        <h2 className="text-2xl font-semibold">Solicitações do ministério</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ReportCard icon={<Music2 />} label="Pedidos de música" value={requestSongs} compact />
          <ReportCard icon={<MessageSquare />} label="Pedidos de tom" value={requestTones} compact />
          <ReportCard icon={<BarChart3 />} label="Solicitações abertas" value={openRequests} compact />
        </div>
      </PremiumPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <BlockList title="Kits mais estudados pelo ministério" data={topN(playsByKit)} />
        <BlockList title="Membros mais ativos" data={topN(playsByUser)} />
      </div>
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
