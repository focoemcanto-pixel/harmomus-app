import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ListMusic, Music2, Plus } from "lucide-react";

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

export default async function RepertoireDetailPage({ params }: { params: Promise<PageParams> }) {
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

  const { data: items, error: itemsError } = await admin
    .from("ministry_repertoire_items")
    .select("id,position,kits(id,slug,name,artist,cover_url)")
    .eq("repertoire_id", repertoire.id)
    .order("position", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  const repertoireItems = (items ?? []) as RepertoireItem[];

  return (
    <MinistryShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/ministerio/repertorios" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Voltar para repertórios
        </Link>
        <Link href={`/ministerio/repertorios/${repertoire.id}/adicionar-kits`} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
          <Plus className="h-4 w-4" /> Adicionar kits
        </Link>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <ListMusic className="h-4 w-4" /> Repertório do Ministério
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{repertoire.name}</h1>
        {repertoire.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">{repertoire.description}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-300">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
            <CalendarDays className="h-4 w-4 text-cyan-200" /> {repertoire.event_date ? formatDate(repertoire.event_date) : `Criado em ${formatDate(repertoire.created_at)}`}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
            <Music2 className="h-4 w-4 text-cyan-200" /> {repertoireItems.length} kit{repertoireItems.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <PremiumPanel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Kits do repertório</p>
            <h2 className="mt-2 text-2xl font-semibold">Músicas para estudar</h2>
            <p className="mt-1 text-sm text-zinc-400">Estes kits formarão o repertório compartilhado com os integrantes do ministério.</p>
          </div>
          <Link href={`/ministerio/repertorios/${repertoire.id}/adicionar-kits`} className="inline-flex w-fit items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20">
            <Plus className="h-4 w-4" /> Adicionar kits
          </Link>
        </div>

        {repertoireItems.length ? (
          <div className="mt-6 divide-y divide-white/10 overflow-hidden rounded-3xl border border-white/10 bg-black/20">
            {repertoireItems.map((item) => {
              const kit = item.kits;
              if (!kit) return null;
              return (
                <div key={item.id} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-zinc-300">
                      {kit.cover_url ? <img src={kit.cover_url} alt={kit.name} className="h-full w-full object-cover" /> : item.position}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-500">#{item.position}</p>
                      <h3 className="text-lg font-semibold text-white">{kit.name}</h3>
                      <p className="text-sm text-zinc-400">{kit.artist || "Kit vocal"}</p>
                    </div>
                  </div>
                  <Link href={`/biblioteca/${kit.slug}`} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
                    Abrir kit
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
              <Music2 className="h-7 w-7" />
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-white">Nenhum kit adicionado ainda</h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">
              Adicione os kits que sua equipe precisa estudar neste repertório.
            </p>
            <Link href={`/ministerio/repertorios/${repertoire.id}/adicionar-kits`} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
              <Plus className="h-4 w-4" /> Adicionar primeiro kit
            </Link>
          </div>
        )}
      </PremiumPanel>
    </MinistryShell>
  );
}
