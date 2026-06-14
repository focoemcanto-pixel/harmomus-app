import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Plus, Save, Settings, Star, Trash2, UserPlus, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { MinistrySubmitButton } from "@/components/ministerio/ministry-submit-button";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string };
type PageSearchParams = { message?: string | string[] };
type MinistryMember = { id: string; invited_name: string | null; invited_email: string | null; status?: string | null };
type TeamMember = { id: string; member_id: string; assigned_voice: string | null; notes: string | null };

const VOICES = [["", "Sem definição"], ["lead", "Lead"], ["tenor", "Tenor"], ["contralto", "Contralto"], ["soprano", "Soprano"], ["baritono", "Barítono"], ["baixo", "Baixo"]] as const;

function getMemberName(member?: MinistryMember | null) { return member?.invited_name || member?.invited_email || "Integrante"; }
function backPath(templateId: string, message?: string) { return `/ministerio/equipes/${templateId}${message ? `?message=${encodeURIComponent(message)}` : ""}`; }
function voiceLabel(value?: string | null) { return VOICES.find(([key]) => key === (value ?? ""))?.[1] ?? "Sem definição"; }
function voiceBadgeClass(value?: string | null) {
  if (value === "lead") return "border-sky-300/30 bg-sky-400/15 text-sky-100";
  if (value === "tenor") return "border-amber-300/30 bg-amber-400/15 text-amber-100";
  if (value === "contralto") return "border-emerald-300/30 bg-emerald-400/15 text-emerald-100";
  if (value === "soprano") return "border-fuchsia-300/30 bg-fuchsia-400/15 text-fuchsia-100";
  if (value === "baritono") return "border-violet-300/30 bg-violet-400/15 text-violet-100";
  if (value === "baixo") return "border-zinc-300/20 bg-zinc-400/10 text-zinc-100";
  return "border-white/10 bg-white/[0.06] text-zinc-200";
}

async function assertTemplate(admin: any, templateId: string, ministryId: string) {
  const { data: template } = await admin.from("ministry_team_templates").select("id").eq("id", templateId).eq("ministry_id", ministryId).maybeSingle();
  if (!template?.id) notFound();
}

async function addTeamMember(formData: FormData) {
  "use server";
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const templateId = String(formData.get("template_id") ?? "").trim();
  const memberId = String(formData.get("member_id") ?? "").trim();
  const assignedVoice = String(formData.get("assigned_voice") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const makeCoordinator = String(formData.get("make_coordinator") ?? "") === "on";
  if (!templateId || !memberId) redirect("/ministerio/equipes");

  const admin = createSupabaseAdminClient() as any;
  await assertTemplate(admin, templateId, context.ministry.ministryId);
  const { data: member } = await admin.from("ministry_members").select("id").eq("id", memberId).eq("ministry_id", context.ministry.ministryId).maybeSingle();
  if (!member?.id) redirect(backPath(templateId, "Integrante não encontrado."));

  const payload = { template_id: templateId, member_id: memberId, assigned_voice: assignedVoice || null, notes: notes || null };
  const { data: existing } = await admin.from("ministry_team_template_members").select("id").eq("template_id", templateId).eq("member_id", memberId).maybeSingle();
  const response = existing?.id ? await admin.from("ministry_team_template_members").update(payload).eq("id", existing.id) : await admin.from("ministry_team_template_members").insert(payload);
  if (response.error) redirect(backPath(templateId, response.error.message));

  if (makeCoordinator) {
    const { error } = await admin.from("ministry_team_templates").update({ coordinator_member_id: memberId }).eq("id", templateId).eq("ministry_id", context.ministry.ministryId);
    if (error) redirect(backPath(templateId, error.message));
  }

  revalidatePath(`/ministerio/equipes/${templateId}`);
  redirect(backPath(templateId, "Integrante adicionado à equipe."));
}

async function updateTeamMember(formData: FormData) {
  "use server";
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const templateId = String(formData.get("template_id") ?? "").trim();
  const rowId = String(formData.get("row_id") ?? "").trim();
  const memberId = String(formData.get("member_id") ?? "").trim();
  const assignedVoice = String(formData.get("assigned_voice") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const makeCoordinator = String(formData.get("make_coordinator") ?? "") === "on";
  if (!templateId || !rowId) redirect("/ministerio/equipes");

  const admin = createSupabaseAdminClient() as any;
  await assertTemplate(admin, templateId, context.ministry.ministryId);
  const { error } = await admin.from("ministry_team_template_members").update({ assigned_voice: assignedVoice || null, notes: notes || null }).eq("id", rowId).eq("template_id", templateId);
  if (error) redirect(backPath(templateId, error.message));

  if (makeCoordinator && memberId) {
    const { error: coordinatorError } = await admin.from("ministry_team_templates").update({ coordinator_member_id: memberId }).eq("id", templateId).eq("ministry_id", context.ministry.ministryId);
    if (coordinatorError) redirect(backPath(templateId, coordinatorError.message));
  }

  revalidatePath(`/ministerio/equipes/${templateId}`);
  revalidatePath("/ministerio/equipes");
  redirect(backPath(templateId, "Vocal atualizado na equipe."));
}

async function clearTeamCoordinator(formData: FormData) {
  "use server";
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");
  const templateId = String(formData.get("template_id") ?? "").trim();
  if (!templateId) redirect("/ministerio/equipes");
  const admin = createSupabaseAdminClient() as any;
  await assertTemplate(admin, templateId, context.ministry.ministryId);
  const { error } = await admin.from("ministry_team_templates").update({ coordinator_member_id: null }).eq("id", templateId).eq("ministry_id", context.ministry.ministryId);
  if (error) redirect(backPath(templateId, error.message));
  revalidatePath(`/ministerio/equipes/${templateId}`);
  revalidatePath("/ministerio/equipes");
  redirect(backPath(templateId, "Coordenador vocal removido."));
}

async function removeTeamMember(formData: FormData) {
  "use server";
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const templateId = String(formData.get("template_id") ?? "").trim();
  const rowId = String(formData.get("row_id") ?? "").trim();
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!templateId || !rowId) redirect("/ministerio/equipes");

  const admin = createSupabaseAdminClient() as any;
  await assertTemplate(admin, templateId, context.ministry.ministryId);
  const { data: template } = await admin.from("ministry_team_templates").select("coordinator_member_id").eq("id", templateId).eq("ministry_id", context.ministry.ministryId).maybeSingle();
  const { error } = await admin.from("ministry_team_template_members").delete().eq("id", rowId).eq("template_id", templateId);
  if (error) redirect(backPath(templateId, error.message));
  if (memberId && template?.coordinator_member_id === memberId) await admin.from("ministry_team_templates").update({ coordinator_member_id: null }).eq("id", templateId).eq("ministry_id", context.ministry.ministryId);

  revalidatePath(`/ministerio/equipes/${templateId}`);
  revalidatePath("/ministerio/equipes");
  redirect(backPath(templateId, "Vocal removido da equipe."));
}

export default async function MinistryTeamDetailPage({ params, searchParams }: { params: Promise<PageParams>; searchParams?: Promise<PageSearchParams> }) {
  const [context, resolvedParams] = await Promise.all([getCurrentUserAccessContext(), params, searchParams ?? Promise.resolve({} as PageSearchParams)]);
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const templateId = resolvedParams.id;

  const [{ data: template, error: templateError }, { data: members, error: membersError }, { data: teamMembers, error: teamMembersError }] = await Promise.all([
    admin.from("ministry_team_templates").select("id,name,description,coordinator_member_id").eq("id", templateId).eq("ministry_id", context.ministry.ministryId).eq("archived", false).maybeSingle(),
    admin.from("ministry_members").select("id,invited_name,invited_email,status").eq("ministry_id", context.ministry.ministryId).order("created_at", { ascending: true }),
    admin.from("ministry_team_template_members").select("id,member_id,assigned_voice,notes").eq("template_id", templateId).order("created_at", { ascending: true }),
  ]);

  if (templateError) throw new Error(templateError.message);
  if (membersError) throw new Error(membersError.message);
  if (teamMembersError) throw new Error(teamMembersError.message);
  if (!template?.id) notFound();

  const activeMembers = ((members ?? []) as MinistryMember[]).filter((member) => member.status !== "removed");
  const membersById = new Map<string, MinistryMember>(activeMembers.map((member) => [member.id, member]));
  const coordinator: MinistryMember | null = template.coordinator_member_id ? (membersById.get(template.coordinator_member_id) ?? null) : null;
  const rows = (teamMembers ?? []) as TeamMember[];
  const selectedIds = new Set(rows.map((row) => row.member_id));
  const availableMembers = activeMembers.filter((member) => !selectedIds.has(member.id));

  return (
    <MinistryShell>
      <Link prefetch href="/ministerio/equipes" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"><ArrowLeft className="h-4 w-4" /> Voltar para equipes</Link>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><Users className="h-4 w-4" /> Equipe vocal</div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{template.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">{template.description || "Equipe sem descrição."}</p>
          </div>
          <details className="group w-full md:w-auto">
            <summary className="inline-flex w-full cursor-pointer list-none items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 md:w-auto"><Plus className="h-4 w-4" /> Adicionar integrante</summary>
            <div className="mt-4 w-full rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl md:w-[420px]">
              <form action={addTeamMember} className="space-y-4">
                <input type="hidden" name="template_id" value={template.id} />
                <label className="block"><span className="text-sm font-semibold text-zinc-200">Integrante</span><select name="member_id" required className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"><option value="">Selecione</option>{availableMembers.map((member) => <option key={member.id} value={member.id}>{getMemberName(member)}</option>)}</select></label>
                <label className="block"><span className="text-sm font-semibold text-zinc-200">Nipe vocal padrão</span><select name="assigned_voice" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50">{VOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
                <label className="block"><span className="text-sm font-semibold text-zinc-200">Observação padrão</span><textarea name="notes" rows={3} maxLength={500} placeholder="Ex.: reforça tenor no refrão." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
                <label className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100"><input type="checkbox" name="make_coordinator" className="h-4 w-4" /> Definir como coordenador vocal</label>
                <MinistrySubmitButton pendingText="Adicionando..." className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"><UserPlus className="h-4 w-4" /> Adicionar</MinistrySubmitButton>
              </form>
            </div>
          </details>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-zinc-200"><Users className="h-4 w-4 text-cyan-200" /> {rows.length} integrante{rows.length === 1 ? "" : "s"}</span>
          {coordinator ? <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2 font-semibold text-amber-100"><Star className="h-4 w-4 fill-current" /> Coordenador vocal: {getMemberName(coordinator)}</span> : <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-zinc-300"><Star className="h-4 w-4" /> Sem coordenador vocal</span>}
        </div>
      </div>

      <PremiumPanel>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Formação</p><h2 className="mt-2 text-2xl font-semibold">Integrantes da equipe</h2></div>
          {coordinator ? <form action={clearTeamCoordinator}><input type="hidden" name="template_id" value={template.id} /><MinistrySubmitButton pendingText="Removendo..." className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"><Star className="h-4 w-4" /> Remover coordenador</MinistrySubmitButton></form> : null}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.length ? rows.map((item) => {
            const member: MinistryMember | null = membersById.get(item.member_id) ?? null;
            const isCoordinator = template.coordinator_member_id === item.member_id;
            return (
              <div key={item.id} className="rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-cyan-300/30 hover:bg-white/[0.045]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{getMemberName(member)}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{member?.invited_email}</p>
                  </div>
                  {isCoordinator ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-100"><Star className="h-3.5 w-3.5 fill-current" /> Coordenador</span> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${voiceBadgeClass(item.assigned_voice)}`}>{voiceLabel(item.assigned_voice)}</span>{item.notes ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300">Com observação</span> : null}</div>
                {item.notes ? <p className="mt-4 text-sm leading-6 text-zinc-300">{item.notes}</p> : null}
                <details className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-cyan-100"><span className="inline-flex items-center gap-2"><Settings className="h-4 w-4" /> Configurar</span><span className="text-xs text-zinc-500">abrir</span></summary>
                  <form action={updateTeamMember} className="mt-4 space-y-3">
                    <input type="hidden" name="template_id" value={template.id} /><input type="hidden" name="row_id" value={item.id} /><input type="hidden" name="member_id" value={item.member_id} />
                    <label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Nipe padrão</span><select name="assigned_voice" defaultValue={item.assigned_voice ?? ""} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50">{VOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
                    <label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Observação</span><textarea name="notes" defaultValue={item.notes ?? ""} rows={3} maxLength={500} placeholder="Observação padrão" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
                    {!isCoordinator ? <label className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100"><input type="checkbox" name="make_coordinator" className="h-4 w-4" /> Tornar coordenador vocal</label> : <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100"><Star className="mr-2 inline h-4 w-4 fill-current" /> Este membro é o coordenador vocal</div>}
                    <MinistrySubmitButton pendingText="Salvando..." className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"><Save className="h-4 w-4" /> Salvar alterações</MinistrySubmitButton>
                  </form>
                  <form action={removeTeamMember} className="mt-3"><input type="hidden" name="template_id" value={template.id} /><input type="hidden" name="row_id" value={item.id} /><input type="hidden" name="member_id" value={item.member_id} /><MinistrySubmitButton pendingText="Removendo..." className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20"><Trash2 className="h-4 w-4" /> Remover da equipe</MinistrySubmitButton></form>
                </details>
              </div>
            );
          }) : <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400 md:col-span-2 xl:col-span-3">Esta equipe ainda não tem vocalistas configurados. Use o botão “Adicionar integrante”.</div>}
        </div>
      </PremiumPanel>
    </MinistryShell>
  );
}
