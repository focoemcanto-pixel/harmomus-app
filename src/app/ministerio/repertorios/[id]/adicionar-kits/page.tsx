import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, Music2, Plus, Search } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { MinistrySubmitButton } from "@/components/ministerio/ministry-submit-button";
import { getActivityActorName, logMinistryActivity } from "@/lib/data/ministry-activity";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = {
  id: string;
};

type SearchParams = {
  q?: string | string[];
  message?: string | string[];
};

type KitRow = {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  cover_url: string | null;
};

function getParamValue(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function sanitizeSearchTerm(value: string) {
  return value
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

async function addKitToRepertoire(formData: FormData) {
  "use server";

  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const repertoireId = String(formData.get("repertoire_id") ?? "").trim();
  const kitId = String(formData.get("kit_id") ?? "").trim();

  if (!repertoireId || !kitId) redirect("/ministerio/repertorios");

  const admin = createSupabaseAdminClient() as any;

  const { data: repertoire, error: repertoireError } = await admin
    .from("ministry_repertoires")
    .select("id,ministry_id,name,archived")
    .eq("id", repertoireId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (repertoireError) throw new Error(repertoireError.message);
  if (!repertoire?.id || repertoire.archived) notFound();

  const { data: kit, error: kitError } = await admin
    .from("kits")
    .select("id,name,artist,published")
    .eq("id", kitId)
    .eq("published", true)
    .maybeSingle();

  if (kitError) throw new Error(kitError.message);
  if (!kit?.id) redirect(`/ministerio/repertorios/${repertoireId}/adicionar-kits?message=Kit%20indispon%C3%ADvel`);

  const { data: existing } = await admin
    .from("ministry_repertoire_items")
    .select("id")
    .eq("repertoire_id", repertoireId)
    .eq("kit_id", kitId)
    .maybeSingle();

  if (existing?.id) {
    redirect(`/ministerio/repertorios/${repertoireId}/adicionar-kits?message=Este%20kit%20j%C3%A1%20est%C3%A1%20no%20repert%C3%B3rio`);
  }

  const { count } = await admin
    .from("ministry_repertoire_items")
    .select("id", { count: "exact", head: true })
    .eq("repertoire_id", repertoireId);

  const position = (count ?? 0) + 1;

  const { data: insertedItem, error } = await admin.from("ministry_repertoire_items").insert({
    repertoire_id: repertoireId,
    kit_id: kitId,
    position,
  }).select("id").single();

  if (error) throw new Error(error.message);

  const actorName = getActivityActorName(context.profile);
  await logMinistryActivity({
    ministryId: context.ministry.ministryId,
    actorUserId: context.profile?.id ?? null,
    actorName,
    action: "repertoire.kit_added",
    entityType: "ministry_repertoire_item",
    entityId: insertedItem?.id ?? null,
    description: `${actorName} adicionou ${kit.name || "um kit"} ao repertório ${repertoire.name || "ministerial"}`,
    metadata: {
      repertoire_id: repertoireId,
      repertoire_name: repertoire.name,
      repertoire_item_id: insertedItem?.id ?? null,
      kit_id: kitId,
      kit_name: kit.name,
      kit_artist: kit.artist,
      position,
    },
  });

  redirect(`/ministerio/repertorios/${repertoireId}/adicionar-kits?message=Kit%20adicionado%20com%20sucesso`);
}

export default async function AddKitsToRepertoirePage({ params, searchParams }: { params: Promise<PageParams>; searchParams?: Promise<SearchParams> }) {
  const [context, resolvedParams, resolvedSearchParams] = await Promise.all([
    getCurrentUserAccessContext(),
    params,
    searchParams ?? Promise.resolve({} as SearchParams),
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const query = sanitizeSearchTerm(getParamValue(resolvedSearchParams.q));

  const { data: repertoire, error: repertoireError } = await admin
    .from("ministry_repertoires")
    .select("id,name,description,archived,ministry_id")
    .eq("id", resolvedParams.id)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (repertoireError) throw new Error(repertoireError.message);
  if (!repertoire?.id || repertoire.archived) notFound();

  const { data: existingItems, error: existingError } = await admin
    .from("ministry_repertoire_items")
    .select("kit_id")
    .eq("repertoire_id", repertoire.id);

  if (existingError) throw new Error(existingError.message);

  const existingKitIds = new Set((existingItems ?? []).map((item: any) => String(item.kit_id)));

  let kitsQuery = admin
    .from("kits")
    .select("id,slug,name,artist,cover_url")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(36);

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
        <Link prefetch href={`/ministerio/repertorios/${repertoire.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Voltar ao repertório
        </Link>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <Music2 className="h-4 w-4" /> Adicionar kits
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{repertoire.name}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
          Busque no acervo Harmomus e adicione os kits que farão parte deste repertório ministerial.
        </p>
      </div>

      <PremiumPanel>
        <form action={`/ministerio/repertorios/${repertoire.id}/adicionar-kits`} className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              name="q"
              defaultValue={query}
              maxLength={80}
              placeholder="Buscar por música ou artista"
              className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50"
            />
          </div>
          <MinistrySubmitButton pendingText="Buscando..." className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
            Buscar
          </MinistrySubmitButton>
        </form>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((kit) => {
            const alreadyAdded = existingKitIds.has(kit.id);
            return (
              <div key={kit.id} className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
                <div className="aspect-video bg-white/5">
                  {kit.cover_url ? <img src={kit.cover_url} alt={kit.name} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-sm text-zinc-500">Harmomus</div>}
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-white">{kit.name}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{kit.artist || "Kit vocal"}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link prefetch href={`/biblioteca/${kit.slug}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10">
                      Ver kit
                    </Link>
                    {alreadyAdded ? (
                      <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                        <Check className="h-3.5 w-3.5" /> Adicionado
                      </span>
                    ) : (
                      <form action={addKitToRepertoire}>
                        <input type="hidden" name="repertoire_id" value={repertoire.id} />
                        <input type="hidden" name="kit_id" value={kit.id} />
                        <MinistrySubmitButton pendingText="Adicionando..." className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-200">
                          <Plus className="h-3.5 w-3.5" /> Adicionar
                        </MinistrySubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!rows.length ? (
          <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-sm text-zinc-400">
            Nenhum kit encontrado para essa busca.
          </div>
        ) : null}
      </PremiumPanel>
    </MinistryShell>
  );
}
