import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, Music2, ShieldCheck, Users } from "lucide-react";

import { MinistryShell, PremiumPanel, formatDate } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = {
  id: string;
};

type MemberRow = {
  id: string;
  user_id: string | null;
  invited_name: string | null;
  invited_email: string | null;
  role: string | null;
  status: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
  } | null;
};

type ProgressRow = {
  user_id: string;
  repertoire_item_id: string | null;
  studied: boolean;
  studied_at: string | null;
  ready: boolean;
  ready_at: string | null;
};

function memberName(member: MemberRow) {
  return member.profiles?.full_name || member.invited_name || member.profiles?.email || member.invited_email || "Integrante";
}

function memberEmail(member: MemberRow) {
  return member.profiles?.email || member.invited_email || "";
}

function metric(label: string, value: string | number, hint?: string) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-2 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export default async function RepertoireProgressPage({ params }: { params: Promise<PageParams> }) {
  const [context, resolvedParams] = await Promise.all([
    getCurrentUserAccessContext(),
    params,
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;

  const { data: repertoire, error } = await admin
    .from("ministry_repertoires")
    .select("id,name,description,event_date,created_at,archived,ministry_id")
    .eq("id", resolvedParams.id)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!repertoire?.id || repertoire.archived) notFound();

  const [itemsResult, membersResult, progressResult] = await Promise.all([
    admin
      .from("ministry_repertoire_items")
      .select("id")
      .eq("repertoire_id", repertoire.id),
    admin
      .from("ministry_members")
      .select("id,user_id,invited_name,invited_email,role,status,profiles(full_name,email)")
      .eq("ministry_id", context.ministry.ministryId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    admin
      .from("ministry_repertoire_progress")
      .select("user_id,repertoire_item_id,studied,studied_at,ready,ready_at")
      .eq("repertoire_id", repertoire.id),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (membersResult.error) throw new Error(membersResult.error.message);
  if (progressResult.error) throw new Error(progressResult.error.message);

  const totalItems = (itemsResult.data ?? []).length;
  const members = ((membersResult.data ?? []) as MemberRow[]).filter((member) => member.user_id);
  const progressRows = (progressResult.data ?? []) as ProgressRow[];

  const progressByUser = new Map<string, ProgressRow[]>();
  for (const row of progressRows) {
    const rows = progressByUser.get(row.user_id) ?? [];
    rows.push(row);
    progressByUser.set(row.user_id, rows);
  }

  const rows = members.map((member) => {
    const userProgress = progressByUser.get(String(member.user_id)) ?? [];
    const studiedRows = userProgress.filter((row) => row.repertoire_item_id && row.studied);
    const readyRow = userProgress.find((row) => !row.repertoire_item_id && row.ready);
    const lastActivity = [...studiedRows.map((row) => row.studied_at), readyRow?.ready_at]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    return {
      member,
      studiedCount: studiedRows.length,
      ready: Boolean(readyRow?.ready),
      readyAt: readyRow?.ready_at ?? null,
      lastActivity,
      percent: totalItems > 0 ? Math.round((studiedRows.length / totalItems) * 100) : 0,
    };
  });

  const readyCount = rows.filter((row) => row.ready).length;
  const averageProgress = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length) : 0;

  return (
    <MinistryShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/ministerio/repertorios/${repertoire.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Voltar ao repertório
        </Link>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <ShieldCheck className="h-4 w-4" /> Acompanhamento da equipe
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{repertoire.name}</h1>
        {repertoire.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">{repertoire.description}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-300">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">{repertoire.event_date ? formatDate(repertoire.event_date) : `Criado em ${formatDate(repertoire.created_at)}`}</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">{totalItems} música{totalItems === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {metric("Integrantes", rows.length)}
        {metric("Prontos", `${readyCount}/${rows.length}`)}
        {metric("Progresso médio", `${averageProgress}%`)}
        {metric("Músicas", totalItems)}
      </div>

      <PremiumPanel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Preparação</p>
            <h2 className="mt-2 text-2xl font-semibold">Status dos integrantes</h2>
            <p className="mt-1 text-sm text-zinc-400">Acompanhe quem estudou as músicas e quem confirmou que está pronto.</p>
          </div>
          <Link href={`/ministerio/repertorios/${repertoire.id}`} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
            Ver repertório
          </Link>
        </div>

        {rows.length ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-black/20">
            <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr] gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.14em] text-zinc-500">
              <span>Integrante</span>
              <span>Estudadas</span>
              <span>Pronto</span>
              <span>Última atividade</span>
            </div>
            {rows.map((row) => (
              <div key={row.member.id} className="grid grid-cols-1 gap-3 border-b border-white/10 px-4 py-4 last:border-b-0 md:grid-cols-[1.4fr_0.8fr_0.8fr_1fr] md:items-center">
                <div>
                  <p className="font-semibold text-white">{memberName(row.member)}</p>
                  <p className="text-xs text-zinc-500">{memberEmail(row.member)}</p>
                </div>
                <div>
                  <p className="font-semibold text-white">{row.studiedCount}/{totalItems}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-300" style={{ width: `${row.percent}%` }} />
                  </div>
                </div>
                <div>
                  {row.ready ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-100">
                      <CheckCircle2 className="h-4 w-4" /> Sim
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-100">
                      <Clock3 className="h-4 w-4" /> Pendente
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-400">{row.lastActivity ? formatDate(row.lastActivity) : "Sem atividade"}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
              <Users className="h-7 w-7" />
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-white">Nenhum integrante ativo encontrado</h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">Convide integrantes para acompanhar o preparo da equipe neste repertório.</p>
          </div>
        )}
      </PremiumPanel>
    </MinistryShell>
  );
}
