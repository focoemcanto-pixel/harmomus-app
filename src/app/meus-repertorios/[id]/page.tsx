import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, ListMusic, Music2, PlayCircle, ShieldCheck } from "lucide-react";

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
  kit_id?: string | null;
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

type ProgressRow = {
  repertoire_item_id: string | null;
  studied: boolean;
  studied_at: string | null;
  ready?: boolean | null;
  ready_at?: string | null;
};

function formatDate(value?: string | null, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function toggleStudied(formData: FormData) {
  "use server";

  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry?.ministryId || !context.profile?.id) redirect("/");

  const repertoireId = String(formData.get("repertoire_id") ?? "").trim();
  const itemId = String(formData.get("item_id") ?? "").trim();
  const kitId = String(formData.get("kit_id") ?? "").trim();
  const nextStudied = String(formData.get("next_studied") ?? "") === "true";

  if (!repertoireId || !itemId || !kitId) redirect("/meus-repertorios");

  const admin = createSupabaseAdminClient() as any;

  const { data: item, error: itemError } = await admin
    .from("ministry_repertoire_items")
    .select("id,kit_id,repertoire_id,ministry_repertoires(id,ministry_id,archived)")
    .eq("id", itemId)
    .eq("repertoire_id", repertoireId)
    .maybeSingle();

  if (itemError) throw new Error(itemError.message);

  const itemMinistryId = item?.ministry_repertoires?.ministry_id;
  const archived = Boolean(item?.ministry_repertoires?.archived);
  if (!item?.id || archived || itemMinistryId !== context.ministry.ministryId) notFound();

  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from("ministry_repertoire_progress")
    .select("id")
    .eq("repertoire_id", repertoireId)
    .eq("repertoire_item_id", itemId)
    .eq("user_id", context.profile.id)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing?.id) {
    const { error } = await admin
      .from("ministry_repertoire_progress")
      .update({
        studied: nextStudied,
        studied_at: nextStudied ? now : null,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("ministry_repertoire_progress").insert({
      repertoire_id: repertoireId,
      repertoire_item_id: itemId,
      kit_id: kitId,
      user_id: context.profile.id,
      studied: nextStudied,
      studied_at: nextStudied ? now : null,
      ready: false,
      created_at: now,
      updated_at: now,
    });

    if (error) throw new Error(error.message);
  }

  if (!nextStudied) {
    await admin
      .from("ministry_repertoire_progress")
      .update({ ready: false, ready_at: null, updated_at: now })
      .eq("repertoire_id", repertoireId)
      .eq("user_id", context.profile.id)
      .is("repertoire_item_id", null)
      .eq("ready", true);
  }

  redirect(`/meus-repertorios/${repertoireId}`);
}

async function toggleReady(formData: FormData) {
  "use server";

  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry?.ministryId || !context.profile?.id) redirect("/");

  const repertoireId = String(formData.get("repertoire_id") ?? "").trim();
  const nextReady = String(formData.get("next_ready") ?? "") === "true";

  if (!repertoireId) redirect("/meus-repertorios");

  const admin = createSupabaseAdminClient() as any;

  const { data: repertoire, error: repertoireError } = await admin
    .from("ministry_repertoires")
    .select("id,ministry_id,archived")
    .eq("id", repertoireId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (repertoireError) throw new Error(repertoireError.message);
  if (!repertoire?.id || repertoire.archived) notFound();

  const [{ count: totalItems }, { count: studiedItems }] = await Promise.all([
    admin
      .from("ministry_repertoire_items")
      .select("id", { count: "exact", head: true })
      .eq("repertoire_id", repertoireId),
    admin
      .from("ministry_repertoire_progress")
      .select("id", { count: "exact", head: true })
      .eq("repertoire_id", repertoireId)
      .eq("user_id", context.profile.id)
      .eq("studied", true)
      .not("repertoire_item_id", "is", null),
  ]);

  const canConfirmReady = Number(totalItems ?? 0) > 0 && Number(studiedItems ?? 0) >= Number(totalItems ?? 0);
  if (nextReady && !canConfirmReady) redirect(`/meus-repertorios/${repertoireId}`);

  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from("ministry_repertoire_progress")
    .select("id")
    .eq("repertoire_id", repertoireId)
    .eq("user_id", context.profile.id)
    .is("repertoire_item_id", null)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing?.id) {
    const { error } = await admin
      .from("ministry_repertoire_progress")
      .update({
        ready: nextReady,
        ready_at: nextReady ? now : null,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("ministry_repertoire_progress").insert({
      repertoire_id: repertoireId,
      repertoire_item_id: null,
      kit_id: null,
      user_id: context.profile.id,
      studied: false,
      studied_at: null,
      ready: nextReady,
      ready_at: nextReady ? now : null,
      created_at: now,
      updated_at: now,
    });

    if (error) throw new Error(error.message);
  }

  redirect(`/meus-repertorios/${repertoireId}`);
}

export default async function MeuRepertorioDetalhePage({ params }: { params: Promise<PageParams> }) {
  const [context, resolvedParams] = await Promise.all([
    getCurrentUserAccessContext(),
    params,
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry?.ministryId || !context.profile?.id) redirect("/");

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

  const [{ data: items, error: itemsError }, { data: progressRows, error: progressError }] = await Promise.all([
    admin
      .from("ministry_repertoire_items")
      .select("id,position,kit_id,kits(id,slug,name,artist,cover_url,original_tone,default_tone)")
      .eq("repertoire_id", repertoire.id)
      .order("position", { ascending: true }),
    admin
      .from("ministry_repertoire_progress")
      .select("repertoire_item_id,studied,studied_at,ready,ready_at")
      .eq("repertoire_id", repertoire.id)
      .eq("user_id", context.profile.id),
  ]);

  if (itemsError) throw new Error(itemsError.message);
  if (progressError) throw new Error(progressError.message);

  const repertoireItems = (items ?? []) as RepertoireItem[];
  const allProgressRows = (progressRows ?? []) as ProgressRow[];
  const progressMap = new Map(
    allProgressRows.filter((row) => row.repertoire_item_id).map((row) => [String(row.repertoire_item_id), row]),
  );
  const readyRow = allProgressRows.find((row) => !row.repertoire_item_id && row.ready);
  const isReady = Boolean(readyRow?.ready);
  const studiedCount = repertoireItems.filter((item) => progressMap.get(item.id)?.studied).length;
  const canConfirmReady = repertoireItems.length > 0 && studiedCount >= repertoireItems.length;

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
                <Music2 className="h-4 w-4 text-cyan-200" /> {studiedCount}/{repertoireItems.length} estudadas
              </span>
              {isReady ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-emerald-100">
                  <ShieldCheck className="h-4 w-4" /> Pronto para tocar
                </span>
              ) : null}
            </div>
          </div>

          {repertoireItems.length ? (
            <div className="mt-8 grid gap-4">
              {repertoireItems.map((item) => {
                const kit = item.kits;
                const progress = progressMap.get(item.id);
                const studied = Boolean(progress?.studied);
                if (!kit) return null;
                return (
                  <div key={item.id} className={`overflow-hidden rounded-3xl border shadow-xl transition ${studied ? "border-emerald-300/30 bg-emerald-400/[0.08]" : "border-white/10 bg-white/[0.045] hover:border-cyan-300/30 hover:bg-white/[0.07]"}`}>
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
                            {studied ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-emerald-100">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Estudada
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <form action={toggleStudied}>
                          <input type="hidden" name="repertoire_id" value={repertoire.id} />
                          <input type="hidden" name="item_id" value={item.id} />
                          <input type="hidden" name="kit_id" value={item.kit_id ?? kit.id} />
                          <input type="hidden" name="next_studied" value={studied ? "false" : "true"} />
                          <button className={`inline-flex w-fit items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition ${studied ? "border border-emerald-300/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20" : "border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/10"}`}>
                            {studied ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                            {studied ? "Estudada" : "Estudei"}
                          </button>
                        </form>
                        <Link href={`/biblioteca/${kit.slug}`} className="inline-flex w-fit items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
                          <PlayCircle className="h-4 w-4" /> Estudar kit
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className={`rounded-3xl border p-6 shadow-xl ${isReady ? "border-emerald-300/30 bg-emerald-400/[0.08]" : canConfirmReady ? "border-cyan-300/25 bg-cyan-400/[0.08]" : "border-white/10 bg-white/[0.04]"}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Confirmação final</p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      {isReady ? "Você confirmou que está pronto" : "Estou pronto para tocar este repertório"}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                      {isReady
                        ? "Sua liderança poderá acompanhar que você concluiu o estudo deste repertório."
                        : canConfirmReady
                          ? "Todas as músicas foram marcadas como estudadas. Agora você pode confirmar que está pronto para participar."
                          : "Marque todas as músicas como estudadas para liberar esta confirmação."}
                    </p>
                  </div>
                  <form action={toggleReady}>
                    <input type="hidden" name="repertoire_id" value={repertoire.id} />
                    <input type="hidden" name="next_ready" value={isReady ? "false" : "true"} />
                    <button disabled={!isReady && !canConfirmReady} className={`inline-flex w-fit items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${isReady ? "border border-emerald-300/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20" : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"}`}>
                      <ShieldCheck className="h-4 w-4" />
                      {isReady ? "Desmarcar pronto" : "Confirmar pronto"}
                    </button>
                  </form>
                </div>
              </div>
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
