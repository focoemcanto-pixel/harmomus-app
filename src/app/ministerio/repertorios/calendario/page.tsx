import Link from "next/link";
import { redirect } from "next/navigation";

import { CalendarScaleForm } from "@/components/ministerio/calendar-scale-form";
import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamOption = { id: string; name: string };

export default async function CalendarScalesPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("ministry_team_templates")
    .select("id,name")
    .eq("ministry_id", context.ministry.ministryId)
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const teams = ((data ?? []) as TeamOption[]).filter((team) => team.id && team.name);

  return (
    <MinistryShell>
      <Link href="/ministerio/repertorios" className="inline-flex w-fit rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/10">Voltar para escalas</Link>
      <PremiumPanel>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Calendário ministerial</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">Programar escalas por equipe</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">Crie várias datas usando uma equipe/template. Depois monte o repertório em cada escala.</p>
        {!teams.length ? <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">Crie uma equipe antes de programar escalas.</div> : null}
        <div className="mt-6"><CalendarScaleForm teams={teams} /></div>
      </PremiumPanel>
    </MinistryShell>
  );
}
