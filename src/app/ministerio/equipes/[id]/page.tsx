import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Save, Trash2, UserPlus, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
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
function getParam(value?: string | string[]) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function backPath(templateId: string, message?: string) { return `/ministerio/equipes/${templateId}${message ? `?message=${encodeURIComponent(message)}` : ""}`; }

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
  if (!templateId || !memberId) redirect("/ministerio/equipes");

  const admin = createSupabaseAdminClient() as any;
  await assertTemplate(admin, templateId, context.ministry.ministryId);
  const { data: member } = await admin.from("ministry_members").select("id").eq("id", memberId).eq("ministry_id", context.ministry.ministryId).maybeSingle();
  if (!member?.id) redirect(backPath(templateId, "Integrante não encontrado."));

  const payload = { template_id: templateId, member_id: memberId, assigned_voice: assignedVoice || null, notes: notes || null };
  const { data: existing } = await admin.from("ministry_team_template_members").select("id").eq("template_id", templateId).eq("member_id", memberId).maybeSingle();
  const response = existing?.id ? await admin.from("ministry_team_template_members").update(payload).eq("id", existing.id) : await admin.from("ministry_team_template_members").insert(payload);

  if (response.error) redirect(backPath(templateId, response.error.message));
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
  const assignedVoice = String(formData.get("assigned_voice") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!templateId || !rowId) redirect("/ministerio/equipes");

  const admin = createSupabaseAdminClient() as any;
  await assertTemplate(admin, templateId, context.ministry.ministryId);
  const { error } = await admin.from("ministry_team_template_members").update({ assigned_voice: assignedVoice || null, notes: notes || null }).eq("id", rowId).eq("template_id", templateId);
  if (error) redirect(backPath(templateId, error.message));

  revalidatePath(`/ministerio/equipes/${templateId}`);
  redirect(backPath(templateId, "Vocal atualizado na equipe."));
}

async function removeTeamMember(formData: FormData) {
  "use server";
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const templateId = String(formData.get("template_id") ?? "").trim();
  const rowId = String(formData.get("row_id") ?? "").trim();
  if (!templateId || !rowId) redirect("/ministerio/equipes");

  const admin = createSupabaseAdminClient() as any;
  await assertTemplate(admin, templateId, context.ministry.ministryId);
  const { error } = await admin.from("ministry_team_template_members").delete().eq("id", rowId).eq("template_id", templateId);
  if (error) redirect(backPath(templateId, error.message));

  revalidatePath(`/ministerio/equipes/${templateId}`);
  redirect(backPath(templateId, "Vocal removido da equipe."));
}

async function updateTeamCoordinator(formData: FormData) {
  "use server";
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const templateId = String(formData.get("template_id") ?? "").trim();
  const coordinatorMemberId = String(formData.get("coordinator_member_id") ?? "").trim();
  if (!templateId) redirect("/ministerio/equipes");

  const admin = createSupabaseAdminClient() as any;
  await assertTemplate(admin, templateId, context.ministry.ministryId);
  if (coordinatorMemberId) {
    const { data: member } = await admin.from("ministry_members").select("id").eq("id", coordinatorMemberId).eq("ministry_id", context.ministry.ministryId).maybeSingle();
    if (!member?.id) redirect(backPath(templateId, "Coordenador inválido para este ministério."));
  }

  const { error } = await admin.from("ministry_team_templates").update({ coordinator_member_id: coordinatorMemberId || null }).eq("id", templateId).eq("ministry_id", context.ministry.ministryId);
  if (error) redirect(backPath(templateId, error.message));
  revalidatePath(`/ministerio/equipes/${templateId}`);
  revalidatePath("/ministerio/equipes");
  redirect(backPath(templateId, "Coordenador vocal atualizado."));
}

export default async function MinistryTeamDetailPage({ params, searchParams }: { params: Promise<PageParams>; searchParams?: Promise<PageSearchParams> }) {
  const [context, resolvedParams, resolvedSearchParams] = await Promise.all([getCurrentUserAccessContext(), params, searchParams ?? Promise.resolve({} as PageSearchParams)]);
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const templateId = resolvedParams.id;
  const message = getParam(resolvedSearchParams.message);

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
      <Link href="/ministerio/equipes" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"><ArrowLeft className="h-4 w-4" /> Voltar para equipes</Link>
      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10"><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><Users className="h-4 w-4" /> Template de equipe vocal</div><h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{template.name}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">{template.description || "Equipe sem descrição."}</p><p className="mt-5 text-sm text-cyan-100">Coordenador vocal padrão: {getMemberName(coordinator)}</p></div>
      {message ? <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">{message}</div> : null}
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <PremiumPanel><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Coordenação</p><h2 className="mt-2 text-2xl font-semibold">Coordenador vocal da equipe</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Você pode definir, trocar ou deixar sem coordenador. O coordenador será sugerido ao criar escalas com esta equipe.</p><form action={updateTeamCoordinator} className="mt-5 space-y-4"><input type="hidden" name="template_id" value={template.id} /><label className="block"><span className="text-sm font-semibold text-zinc-200">Coordenador vocal</span><select name="coordinator_member_id" defaultValue={template.coordinator_member_id ?? ""} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"><option value="">Sem coordenador</option>{activeMembers.map((member) => <option key={member.id} value={member.id}>{getMemberName(member)}</option>)}</select></label><button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-400/20"><Save className="h-4 w-4" /> Salvar coordenador</button></form></PremiumPanel>
        <PremiumPanel><div className="flex items-start gap-4"><div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100"><UserPlus className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Adicionar vocal</p><h2 className="mt-2 text-2xl font-semibold">Montar formação</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Aqui você define apenas o nipe vocal padrão da equipe. Tom será definido em cada música da escala.</p></div></div><form action={addTeamMember} className="mt-6 space-y-4"><input type="hidden" name="template_id" value={template.id} /><label className="block"><span className="text-sm font-semibold text-zinc-200">Integrante</span><select name="member_id" required className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"><option value="">Selecione</option>{availableMembers.map((member) => <option key={member.id} value={member.id}>{getMemberName(member)}</option>)}</select></label><label className="block"><span className="text-sm font-semibold text-zinc-200">Nipe vocal padrão</span><select name="assigned_voice" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50">{VOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label className="block"><span className="text-sm font-semibold text-zinc-200">Observação padrão</span><textarea name="notes" rows={3} maxLength={500} placeholder="Ex.: Costuma estudar como tenor, mas pode reforçar lead em refrão." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label><button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"><Save className="h-4 w-4" /> Salvar na equipe</button></form></PremiumPanel>
      </div>
      <PremiumPanel><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Integrantes configurados</p><h2 className="mt-2 text-2xl font-semibold">{rows.length} vocal{rows.length === 1 ? "" : "s"} nesta equipe</h2><div className="mt-6 grid gap-3">{rows.length ? rows.map((item) => { const member: MinistryMember | null = membersById.get(item.member_id) ?? null; return <div key={item.id} className="rounded-3xl border border-white/10 bg-black/20 p-5"><div><h3 className="text-xl font-semibold text-white">{getMemberName(member)}</h3><p className="mt-1 text-xs text-zinc-500">{member?.invited_email}</p></div><form action={updateTeamMember} className="mt-5 grid gap-3 md:grid-cols-[1fr_1.4fr_auto]"><input type="hidden" name="template_id" value={template.id} /><input type="hidden" name="row_id" value={item.id} /><label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Nipe padrão</span><select name="assigned_voice" defaultValue={item.assigned_voice ?? ""} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50">{VOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Observação</span><input name="notes" defaultValue={item.notes ?? ""} maxLength={500} placeholder="Observação padrão" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label><button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 md:w-fit"><Save className="h-4 w-4" /> Salvar</button></form><form action={removeTeamMember} className="mt-3"><input type="hidden" name="template_id" value={template.id} /><input type="hidden" name="row_id" value={item.id} /><button className="inline-flex w-fit items-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20"><Trash2 className="h-4 w-4" /> Remover vocal</button></form></div>; }) : <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Esta equipe ainda não tem vocalistas configurados.</div>}</div></PremiumPanel>
    </MinistryShell>
  );
}
