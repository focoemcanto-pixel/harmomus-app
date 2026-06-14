import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ListMusic, Music2, Plus, UserCheck, Users, Play } from "lucide-react";

import { DeleteScaleButton } from "@/components/ministerio/delete-scale-button";
import { ScaleKitManager } from "@/components/ministerio/scale-kit-manager";
import { MinistryShell, PremiumPanel, formatDate } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string };

type RepertoireItem = {
  id: string;
  position: number;
  kits: { id: string; slug: string; name: string; artist: string | null; cover_url: string | null } | null;
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

type MinistryMemberRow = {
  id: string;
  invited_name?: string | null;
  invited_email?: string | null;
  profiles?: { full_name?: string | null; email?: string | null } | null;
};

type TeamTemplateRow = { id: string; name: string } | null;

function isSchemaMissing(message?: string | null) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find");
}

function memberLabel(member?: MinistryMemberRow | null) {
  return member?.invited_name || member?.profiles?.full_name || member?.invited_email || member?.profiles?.email || "Integrante";
}

function memberEmail(member?: MinistryMemberRow | null) {
  return member?.invited_email || member?.profiles?.email || "";
}

function studyModeLabel(value?: string | null) {
  if (value === "full_mix") return "Mix completo";
  if (value === "instrumental") return "Instrumental";
  if (value === "custom") return "Personalizado";
  return "Voz definida";
}

export default async function RepertoireDetailPage({ params }: { params: Promise<PageParams> }) {
  const [context, resolvedParams] = await Promise.all([getCurrentUserAccessContext(), params]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");

  const canManage = isMinistryManager(context);
  const admin = createSupabaseAdminClient() as any;

  const { data: repertoire, error } = await admin
    .from("ministry_repertoires")
    .select("id,name,description,event_date,created_at,archived,ministry_id,team_template_id,coordinator_member_id,status")
    .eq("id", resolvedParams.id)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!repertoire?.id || repertoire.archived) notFound();

  const [{ data: items, error: itemsError }, assignmentsResult, { data: members }, { data: teamTemplate }] = await Promise.all([
    admin.from("ministry_repertoire_items").select("id,position,kits(id,slug,name,artist,cover_url)").eq("repertoire_id", repertoire.id).order("position", { ascending: true }),
    admin.from("ministry_repertoire_assignments").select("id,member_id,assigned_role,assigned_voice,assigned_tone,study_mode,notes").eq("repertoire_id", repertoire.id).is("repertoire_item_id", null).order("created_at", { ascending: true }),
    admin.from("ministry_members").select("id,invited_name,invited_email,profiles(full_name,email)").eq("ministry_id", context.ministry.ministryId),
    repertoire.team_template_id ? admin.from("ministry_team_templates").select("id,name").eq("id", repertoire.team_template_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (itemsError) throw new Error(itemsError.message);

  const assignmentsError = assignmentsResult?.error;
  const assignmentsSchemaMissing = isSchemaMissing(assignmentsError?.message);
  if (assignmentsError && !assignmentsSchemaMissing) throw new Error(assignmentsError.message);

  const repertoireItems = (items ?? []) as RepertoireItem[];
  const scaleAssignments = (assignmentsSchemaMissing ? [] : (assignmentsResult?.data ?? [])) as ScaleAssignment[];
  const memberRows = (members ?? []) as MinistryMemberRow[];
  const membersById = new Map<string, MinistryMemberRow>(memberRows.map((member) => [member.id, member]));
  const coordinator = repertoire.coordinator_member_id ? (membersById.get(repertoire.coordinator_member_id) ?? null) : null;
  const selectedTeamTemplate = teamTemplate as TeamTemplateRow;
  const selectedSongs = repertoireItems.flatMap((item) => {
    if (!item.kits) return [];
    return [{ id: item.id, kitId: item.kits.id, position: item.position, name: item.kits.name, artist: item.kits.artist }];
  });

  return (
    <MinistryShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/ministerio/repertorios" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Voltar para Minha Escala
        </Link>
        {canManage ? (
          <div className="flex flex-wrap items-start justify-end gap-2">
            <Link href={`/ministerio/repertorios/${repertoire.id}/integrantes`} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20">
              <UserCheck className="h-4 w-4" /> Gerenciar integrantes
            </Link>
            <Link href={`/ministerio/repertorios/${repertoire.id}/adicionar-kits`} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
              <Plus className="h-4 w-4" /> Adicionar músicas
            </Link>
            <DeleteScaleButton repertoireId={repertoire.id} />
          </div>
        ) : null}
      </div>

      {assignmentsSchemaMissing ? (
        <PremiumPanel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Configuração pendente</p>
          <h2 className="mt-2 text-2xl font-semibold">Tabela de integrantes da escala ainda não reconhecida</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-300">Aplique a migration de integrantes da escala no Supabase. A página foi estabilizada para não derrubar o app.</p>
        </PremiumPanel>
      ) : null}

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><ListMusic className="h-4 w-4" /> Escala Ministerial</div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{repertoire.name}</h1>
        {repertoire.description ? <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-zinc-300 md:text-base">{repertoire.description}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-300">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2"><CalendarDays className="h-4 w-4 text-cyan-200" /> {repertoire.event_date ? formatDate(repertoire.event_date) : `Criado em ${formatDate(repertoire.created_at)}`}</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2"><Music2 className="h-4 w-4 text-cyan-200" /> {repertoireItems.length} música{repertoireItems.length === 1 ? "" : "s"}</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2"><Users className="h-4 w-4 text-cyan-200" /> {scaleAssignments.length} integrante{scaleAssignments.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <PremiumPanel>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Coordenação</p>
          <h2 className="mt-2 text-2xl font-semibold">Responsáveis da escala</h2>
          <div className="mt-5 space-y-3 text-sm text-zinc-300">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Coordenador vocal</p><p className="mt-1 text-base font-semibold text-white">{coordinator ? memberLabel(coordinator) : "Não definido"}</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Equipe/template</p><p className="mt-1 text-base font-semibold text-white">{selectedTeamTemplate?.name || "Sem template"}</p></div>
          </div>
        </PremiumPanel>

        <PremiumPanel>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4"><div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100"><UserCheck className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Integrantes da escala</p><h2 className="mt-2 text-2xl font-semibold">Vocais e estudo</h2><p className="mt-2 text-sm leading-6 text-zinc-400">O nipe final pode ser ajustado em cada música.</p></div></div>
            {canManage ? <Link href={`/ministerio/repertorios/${repertoire.id}/integrantes`} className="hidden rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 md:inline-flex">Editar</Link> : null}
          </div>
          <div className="mt-6 grid gap-3">
            {scaleAssignments.length ? scaleAssignments.map((assignment) => { const member = membersById.get(assignment.member_id); const isCoordinator = assignment.member_id === repertoire.coordinator_member_id; return <div key={assignment.id} className="rounded-3xl border border-white/10 bg-black/20 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-white">{memberLabel(member)}</h3>{isCoordinator ? <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">Coordenador vocal</span> : null}</div><p className="mt-1 text-xs text-zinc-500">{memberEmail(member)}</p><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">Nipe padrão: {assignment.assigned_voice || "Definir por música"}</span><span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-100">Estudo: {studyModeLabel(assignment.study_mode)}</span></div>{assignment.notes ? <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">{assignment.notes}</p> : null}</div>; }) : <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Nenhum integrante foi atribuído ainda. Use um template de equipe na criação da escala ou adicione vocalistas manualmente.</div>}
          </div>
        </PremiumPanel>
      </div>

      <PremiumPanel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Playlist</p>
            <h2 className="mt-2 text-2xl font-semibold">Músicas da escala</h2>
            <p className="mt-1 text-sm text-zinc-400">{canManage ? "Abra o bloco de montagem para ver, adicionar e configurar o repertório." : "Estas são as músicas definidas pelo responsável do seu ministério."}</p>
          </div>
          <Link href="/ministerio/repertorios" className="inline-flex w-fit items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"><Play className="h-4 w-4 fill-current" /> Estudar agora</Link>
        </div>

        {canManage ? <ScaleKitManager repertoireId={repertoire.id} selectedSongs={selectedSongs} /> : (
          <div className="mt-5 rounded-[2rem] border border-white/10 bg-black/20 p-5 text-sm text-zinc-400">{repertoireItems.length} música{repertoireItems.length === 1 ? "" : "s"} atribuída{repertoireItems.length === 1 ? "" : "s"} para estudo. Use o botão Estudar agora para acessar suas escalas.</div>
        )}
      </PremiumPanel>
    </MinistryShell>
  );
}
