import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Music2, Search } from "lucide-react";

import { AddKitCard } from "@/components/ministerio/add-kit-card";
import { MinistryRouteTransition } from "@/components/ministerio/ministry-route-transition";
import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { MinistrySubmitButton } from "@/components/ministerio/ministry-submit-button";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string };
type SearchParams = { q?: string | string[]; message?: string | string[] };
type KitRow = { id: string; slug: string; name: string; artist: string | null; cover_url: string | null };
function getParamValue(value?: string | string[]) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function sanitizeSearchTerm(value: string) { return value.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").slice(0, 80); }

export default async function AddKitsToRepertoirePage({ params, searchParams }: { params: Promise<PageParams>; searchParams?: Promise<SearchParams> }) {
  const [context, resolvedParams, resolvedSearchParams] = await Promise.all([getCurrentUserAccessContext(), params, searchParams ?? Promise.resolve({} as SearchParams)]);
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const query = sanitizeSearchTerm(getParamValue(resolvedSearchParams.q));
  const { data: repertoire, error: repertoireError } = await admin.from("ministry_repertoires").select("id,name,description,archived,ministry_id").eq("id", resolvedParams.id).eq("ministry_id", context.ministry.ministryId).maybeSingle();
  if (repertoireError) throw new Error(repertoireError.message);
  if (!repertoire?.id || repertoire.archived) notFound();

  const { data: existingItems, error: existingError } = await admin.from("ministry_repertoire_items").select("kit_id").eq("repertoire_id", repertoire.id);
  if (existingError) throw new Error(existingError.message);
  const existingKitIds = new Set((existingItems ?? []).map((item: any) => String(item.kit_id)));

  let kitsQuery = admin.from("kits").select("id,slug,name,artist,cover_url").eq("published", true).order("created_at", { ascending: false }).limit(36);
  if (query) {
    const escapedQuery = query.replace(/[%_]/g, "");
    kitsQuery = kitsQuery.or(`name.ilike.%${escapedQuery}%,artist.ilike.%${escapedQuery}%`);
  }
  const { data: kits, error: kitsError } = await kitsQuery;
  if (kitsError) throw new Error(kitsError.message);
  const rows = (kits ?? []) as KitRow[];

  return (
    <MinistryShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MinistryRouteTransition href={`/ministerio/repertorios/${repertoire.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 data-[pending=true]:bg-white/10"><ArrowLeft className="h-4 w-4" /> Voltar ao repertório</MinistryRouteTransition>
      </div>
      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10"><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><Music2 className="h-4 w-4" /> Adicionar kits</div><h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{repertoire.name}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">Busque no acervo Harmomus e adicione os kits que farão parte deste repertório ministerial.</p></div>
      <PremiumPanel>
        <form action={`/ministerio/repertorios/${repertoire.id}/adicionar-kits`} className="flex flex-col gap-3 md:flex-row md:items-center"><div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input name="q" defaultValue={query} maxLength={80} placeholder="Buscar por música ou artista" className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50" /></div><MinistrySubmitButton pendingText="Buscando..." className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">Buscar</MinistrySubmitButton></form>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((kit) => <AddKitCard key={kit.id} kit={kit} repertoireId={repertoire.id} alreadyAdded={existingKitIds.has(kit.id)} />)}</div>
        {!rows.length ? <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Nenhum kit encontrado.</div> : null}
      </PremiumPanel>
    </MinistryShell>
  );
}
