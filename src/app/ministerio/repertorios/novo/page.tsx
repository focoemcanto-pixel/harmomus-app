import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Save } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NovoRepertorioSearchParams = {
  error?: string | string[];
};

function getSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

async function createRepertoire(formData: FormData) {
  "use server";

  const context = await getCurrentUserAccessContext();

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const eventDate = String(formData.get("event_date") ?? "").trim();

  if (!name) {
    redirect("/ministerio/repertorios/novo?error=Informe%20o%20nome%20do%20repert%C3%B3rio");
  }

  const admin = createSupabaseAdminClient() as any;
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("ministry_repertoires")
    .insert({
      ministry_id: context.ministry.ministryId,
      name,
      description: description || null,
      event_date: eventDate || null,
      created_by: context.profile?.id ?? null,
      archived: false,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    const message = encodeURIComponent(error?.message || "Não foi possível criar o repertório.");
    redirect(`/ministerio/repertorios/novo?error=${message}`);
  }

  redirect(`/ministerio/repertorios/${data.id}`);
}

export default async function NovoRepertorioPage({ searchParams }: { searchParams?: Promise<NovoRepertorioSearchParams> | NovoRepertorioSearchParams }) {
  const [context, rawParams] = await Promise.all([
    getCurrentUserAccessContext(),
    Promise.resolve(searchParams ?? {}),
  ]);
  const errorMessage = getSearchParamValue(rawParams.error);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  return (
    <MinistryShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/ministerio/repertorios" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Voltar para repertórios
        </Link>
      </div>

      <PremiumPanel>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              <CalendarDays className="h-4 w-4" /> Novo repertório
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Organize um repertório para sua equipe</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300 md:text-base">
              Comece pelo nome, descrição e data. No próximo passo você poderá adicionar os kits que os integrantes precisam estudar.
            </p>
          </div>

          <form action={createRepertoire} className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
            {errorMessage ? (
              <div className="mb-5 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                {errorMessage}
              </div>
            ) : null}

            <label className="block">
              <span className="text-sm font-semibold text-zinc-200">Nome do repertório</span>
              <input
                name="name"
                required
                maxLength={120}
                placeholder="Ex.: Culto Domingo Manhã"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50 focus:bg-white/[0.07]"
              />
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-zinc-200">Descrição</span>
              <textarea
                name="description"
                rows={4}
                maxLength={500}
                placeholder="Ex.: Repertório do louvor da manhã, ensaio quinta-feira às 19h."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50 focus:bg-white/[0.07]"
              />
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-zinc-200">Data do culto/evento</span>
              <input
                type="date"
                name="event_date"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50 focus:bg-white/[0.07]"
              />
            </label>

            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
              <Link href="/ministerio/repertorios" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
                Cancelar
              </Link>
              <button className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
                <Save className="h-4 w-4" /> Salvar repertório
              </button>
            </div>
          </form>
        </div>
      </PremiumPanel>
    </MinistryShell>
  );
}
