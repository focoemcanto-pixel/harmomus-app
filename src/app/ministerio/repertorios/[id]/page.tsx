import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ListMusic, Music2, Plus, UserCheck, Users } from "lucide-react";

import { MinistryPlaylistPlayer } from "@/components/ministerio/ministry-playlist-player";
import { MinistryShell, PremiumPanel, formatDate } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = {
  id: string;
};

type RepertoireItem = {
  id: string;
  position: number;
  kits: {
    id: string;
    slug: string;
    name: string;
    artist: string | null;
    cover_url: string | null;
  } | null;
};

type ScaleAssignment = {
  id: string;
  member_id: string;
  assigned_role: string | null;
  assigned_voice: string | null;
  assigned_tone: string | null;
  study_mode: string | null;
  notes: string | null;
};

function memberLabel(member: any) {
  return member?.invited_name || member?.profile?.full_name || member?.invited_email || member?.profile?.email || "Integrante";
}

function studyModeLabel(value?: string | null) {
  if (value === "full_mix") return "Mix completo";
  if (value === "instrumental") return "Instrumental";
  if (value === "custom") return "Personalizado";
  return "Voz definida";
}

export default async function RepertoireDetailPage({ params }: { params: Promise<PageParams> }) {
  const [context, resolvedParams] = await Promise.all([
    getCurrentUserAccessContext(),
    params,
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");

  const canManage = isMinistryManager(context);
  const admin = createSupabaseAdminClient() as any;

  const { data: repertoire, error } = await admin
    .from("ministry_repertoires")
    .select("id,name,description,event_date,created_at,archived,ministry_id,team_template_id,coordinator_member_id,general_notes,status")
    .eq("id", resolvedParams.id)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!repertoire?.id || repertoire.archived) notFound();

  const [{ data: items, error: itemsError }, { data: assignments, error: assignmentsError }, { data: members }, { data: teamTemplate }] = await Promise.all([
    admin
      .from("ministry_repertoire_items")
      .select("id,position,kits(id,slug,name,artist,cover_url)")
      .eq("repertoire_id", repertoire.id)
      .order("position", { ascending: true }),
    admin
      .from("ministry_repertoire_assignments")
      .select("id,member_id,assigned_role,assigned_voice,assigned_tone,study_mode,notes")
      .eq("repertoire_id", repertoire.id)
      .is("repertoire_item_id", null)
      .order("created_at", { ascending: true }),
    admin
      .from("ministry_members")
      .select("id,invited_name,invited_email,role,status,profile:profiles(full_name,email)")
      .eq("ministry_id", context.ministry.ministryId),
    repertoire.team_template_id
      ? admin
          .from("ministry_team_templates")
          .select("id,name")
          .eq("id", repertoire.team_template_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (itemsError) throw new Error(itemsError.message);
  if (assignmentsError) throw new Error(assignmentsError.message);

  const repertoireItems = (items ?? []) as RepertoireItem[];
  const scaleAssignments = (assignments ?? []) as ScaleAssignment[];
  const membersById = new Map((members ?? []).map((member: any) => [member.id, member]));
  const coordinator = repertoire.coordinator_member_id ? membersById.get(repertoire.coordinator_member_id) : null;

  return (
    <MinistryShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/ministerio/repertorios" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Voltar para Minha Escala
        </Link>
        {canManage ? (
          <Link href={`/ministerio/repertorios/${repertoire.id}/adicionar-kits`} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
            <Plus className="h-4 w-4" /> Adicionar músicas
          </Link>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <ListMusic className="h-4 w-4" /> Escala Ministerial
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{repertoire.name}</h1>
        {repertoire.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">{repertoire.description}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-300">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
            <CalendarDays className="h-4 w-4 text-cyan-200" /> {repertoire.event_date ? formatDate(repertoire.event_date) : `Criado em ${formatDate(repertoire.created_at)}`}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
            <Music2 className="h-4 w-4 text-cyan-200" /> {repertoireItems.length} música{repertoireItems.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
            <Users className="h-4 w-4 text-cyan-200" /> {scaleAssignments.length} integrante{scaleAssignments.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <PremiumPanel>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Coordenação</p>
          <h2 className="mt-2 text-2xl font-semibold">Responsáveis da escala</h2>
          <div className="mt-5 space-y-3 text-sm text-zinc-300">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Coordenador vocal</p>
              <p className="mt-1 text-base font-semibold text-white">{coordinator ? memberLabel(coordinator) : "Não definido"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Equipe/template</p>
              <p className="mt-1 text-base font-semibold text-white">{teamTemplate?.name || "Sem template"}</p>
            </div>
            {repertoire.general_notes ? (
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-cyan-50">
                <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Observação geral</p>
                <p className="mt-2 leading-6">{repertoire.general_notes}</p>
              </div>
            ) : null}
          </div>
        </PremiumPanel>

        <PremiumPanel>
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100"><UserCheck className="h-5 w-5" /></div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Integrantes da escala</p>
              <h2 className="mt-2 text-2xl font-semibold">Funções, vozes e estudo</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Estas definições serão usadas quando o integrante abrir a escala e estudar a playlist.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {scaleAssignments.length ? scaleAssignments.map((assignment) => {
              const member = membersById.get(assignment.member_id);
              return (
                <div key={assignment.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{memberLabel(member)}</h3>
                      <p className="mt-1 text-xs text-zinc-500">{member?.invited_email || member?.profile?.email}</p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-zinc-200">Função: {assignment.assigned_role || "—"}</span>
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">Voz: {assignment.assigned_voice || "—"}</span>
                        <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-1 text-fuchsia-100">Tom: {assignment.assigned_tone || "—"}</span>
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-100">Estudo: {studyModeLabel(assignment.study_mode)}</span>
                      </div>
                      {assignment.notes ? <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">{assignment.notes}</p> : null}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">
                Nenhum integrante foi atribuído ainda. Use um template de equipe na criação da escala ou adicione integrantes manualmente na próxima etapa.
              </div>
            )}
          </div>
        </PremiumPanel>
      </div>

      <PremiumPanel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Playlist</p>
            <h2 className="mt-2 text-2xl font-semibold">Músicas da escala</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {canManage
                ? "Estas músicas formarão a playlist ministerial compartilhada com os integrantes do ministério."
                : "Estas são as músicas definidas pelo responsável do seu ministério para estudo."}
            </p>
          </div>
          {canManage ? (
            <Link href={`/ministerio/repertorios/${repertoire.id}/adicionar-kits`} className="inline-flex w-fit items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20">
              <Plus className="h-4 w-4" /> Adicionar músicas
            </Link>
          ) : null}
        </div>

        {repertoireItems.length ? (
          <MinistryPlaylistPlayer
            tracks={repertoireItems.flatMap((item) => {
              const kit = item.kits;
              if (!kit) return [];

              return [
                {
                  id: item.id,
                  position: item.position,
                  name: kit.name,
                  artist: kit.artist,
                  coverUrl: kit.cover_url,
                  href: `/biblioteca/${kit.slug}`,
                },
              ];
            })}
          />
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
              <Music2 className="h-7 w-7" />
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-white">Nenhuma música adicionada ainda</h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">
              {canManage
                ? "Adicione as músicas que sua equipe precisa estudar nesta escala."
                : "Quando o responsável adicionar músicas, elas aparecerão aqui."}
            </p>
            {canManage ? (
              <Link href={`/ministerio/repertorios/${repertoire.id}/adicionar-kits`} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
                <Plus className="h-4 w-4" /> Adicionar primeira música
              </Link>
            ) : null}
          </div>
        )}
      </PremiumPanel>
    </MinistryShell>
  );
}