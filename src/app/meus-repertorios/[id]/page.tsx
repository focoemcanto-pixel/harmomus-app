import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ListMusic, Music2, PlayCircle } from "lucide-react";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
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
    original_tone: string | null;
    default_tone: string | null;
  } | null;
};

function formatDate(value?: string | null, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function MeuRepertorioDetalhePage({ params }: { params: Promise<PageParams> }) {
  const [context, resolvedParams] = await Promise.all([
    getCurrentUserAccessContext(),
    params,
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry?.ministryId) redirect("/");

  const admin = createSupabaseAdminClient() as any;

  const [{ data: ministry }, { data: repertoire, error }] = await Promise.all([
    admin.from("ministries").select("id,name").eq("id", context.ministry.ministryId).maybeSingle(),
    admin
      .from("ministry_repertoires")
      .select("id,name,description,event_date,created_at,archived,ministry_id")
      .eq("id", resolvedParams.id)
      .eq("ministry_id", context.ministry.ministryId)
      .maybeSingle(),
  ]);

  if (error) throw new Error(error.message);
  if (!repertoire?.id || repertoire.archived) notFound();

  const { data: items, error: itemsError } = await admin
    .from("ministry_repertoire_items")
    .select("id,position,kits(id,slug,name,artist,cover_url,original_tone,default_tone)")
    .eq("repertoire_id", repertoire.id)
    .order("position", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  const repertoireItems = (items ?? []) as RepertoireItem[];

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#050816] via-[#080b18] to-[#06070c] px-4 py-8 text-white md:px-8">
        <section className="mx-auto max-w-6xl">
          <Link href="/meus-repertorios" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" /> Voltar para meus repertórios
          </Link>

          <div className="mt-6 overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#06111f] p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              <ListMusic className="h-4 w-4" /> Repertório compartilhado
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">{repertoire.name}</h1>
            {repertoire.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">{repertoire.description}</p> : null}
            <p className="mt-3 text-sm text-cyan-100/80">Compartilhado por {ministry?.name ?? "seu ministério"}</p>

            <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-300">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
                <CalendarDays className="h-4 w-4 text-cyan-200" /> {repertoire.event_date ? formatDate(repertoire.event_date) : `Criado em ${formatDate(repertoire.created_at)}`}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
                <Music2 className="h-4 w-4 text-cyan-200" /> {repertoireItems.length} kit{repertoireItems.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {repertoireItems.length ? (
            <div className="mt-8 grid gap-4">
              {repertoireItems.map((item) => {
                const kit = item.kits;
                if (!kit) return null;
                return (
                  <div key={item.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-xl transition hover:border-cyan-300/30 hover:bg-white/[0.07]">
                    <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
                      <div className="flex items-center gap-4">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-lg font-black text-zinc-300">
                          {kit.cover_url ? <img src={kit.cover_url} alt={kit.name} className="h-full w-full object-cover" /> : item.position}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Música #{item.position}</p>
                          <h2 className="mt-1 text-2xl font-black text-white">{kit.name}</h2>
                          <p className="mt-1 text-sm text-zinc-400">{kit.artist || "Kit vocal"}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-300">
                            {kit.default_tone || kit.original_tone ? (
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                Tom: {kit.default_tone || kit.original_tone}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <Link href={`/biblioteca/${kit.slug}`} className="inline-flex w-fit items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
                        <PlayCircle className="h-4 w-4" /> Estudar kit
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-white/[0.04] p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                <Music2 className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-2xl font-black text-white">Este repertório ainda não possui kits</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">
                Quando a liderança adicionar músicas, elas aparecerão aqui para estudo.
              </p>
            </div>
          )}
        </section>
      </main>
    </PublicAppShell>
  );
}
