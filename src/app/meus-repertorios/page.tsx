import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, ListMusic, Music2, ShieldCheck } from "lucide-react";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RepertoireRow = {
  id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  created_at: string;
  kitCount: number;
  studiedCount: number;
};

function formatDate(value?: string | null, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function countItemsByRepertoire(items: any[] | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items ?? []) {
    const repertoireId = String(item.repertoire_id ?? "");
    if (!repertoireId) continue;
    counts.set(repertoireId, (counts.get(repertoireId) ?? 0) + 1);
  }
  return counts;
}

function countStudiedByRepertoire(progressRows: any[] | null | undefined) {
  const counts = new Map<string, number>();
  for (const row of progressRows ?? []) {
    const repertoireId = String(row.repertoire_id ?? "");
    const isStudied = row.study_status ? row.study_status === "studied" : Boolean(row.studied);
    if (!repertoireId || !row.repertoire_item_id || !isStudied) continue;
    counts.set(repertoireId, (counts.get(repertoireId) ?? 0) + 1);
  }
  return counts;
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#050816] via-[#080b18] to-[#06070c] px-4 py-8 text-white md:px-8">
        <section className="mx-auto max-w-4xl">
          <div className="overflow-hidden rounded-[2rem] border border-amber-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#06111f] p-6 shadow-[0_30px_100px_rgba(245,158,11,0.14)] md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
              <ShieldCheck className="h-4 w-4" /> Atenção
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">{message}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/todos-os-kits" className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
                Explorar kits
              </Link>
              <Link href="/assinatura" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-zinc-100 transition hover:bg-white/10">
                Ver assinatura
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}

function getErrorMessage(error: unknown) {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? "Erro desconhecido.");
  return "Erro desconhecido.";
}

export default async function MeusRepertoriosPage() {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) redirect("/login");
  if (!context.profile?.id) redirect("/login");
  if (!context.ministry?.ministryId) {
    return (
      <ErrorState
        title="Convite ministerial pendente"
        message="Esta conta ainda não está vinculada a um ministério ativo. Para ver sua escala compartilhada, aceite o convite enviado pela liderança ou peça um novo convite para este mesmo e-mail."
      />
    );
  }

  const admin = createSupabaseAdminClient() as any;

  const ministryResult = await admin.from("ministries").select("id,name").eq("id", context.ministry.ministryId).maybeSingle();
  const repertoireResult = await admin
    .from("ministry_repertoires")
    .select("id,name,description,event_date,created_at")
    .eq("ministry_id", context.ministry.ministryId)
    .eq("archived", false)
    .order("event_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (ministryResult.error || repertoireResult.error) {
    const message = getErrorMessage(ministryResult.error ?? repertoireResult.error);
    console.error("[MeusRepertoriosPage] failed to load repertoires", ministryResult.error ?? repertoireResult.error);
    return <ErrorState title="Não foi possível carregar sua escala" message={message} />;
  }

  const ministry = ministryResult.data;
  const repertoires = repertoireResult.data ?? [];
  const repertoireIds = repertoires.map((repertoire: any) => repertoire.id).filter(Boolean);
  const [itemResult, progressResult] = repertoireIds.length
    ? await Promise.all([
        admin
          .from("ministry_repertoire_items")
          .select("id,repertoire_id")
          .in("repertoire_id", repertoireIds),
        admin
          .from("ministry_repertoire_progress")
          .select("repertoire_id,repertoire_item_id,studied,study_status")
          .eq("user_id", context.profile.id)
          .in("repertoire_id", repertoireIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (itemResult.error) {
    const message = getErrorMessage(itemResult.error);
    console.error("[MeusRepertoriosPage] failed to load repertoire items", itemResult.error);
    return <ErrorState title="Não foi possível carregar as músicas da escala" message={message} />;
  }

  if (progressResult.error) {
    const message = getErrorMessage(progressResult.error);
    console.error("[MeusRepertoriosPage] failed to load repertoire progress", progressResult.error);
    return <ErrorState title="Não foi possível carregar seu progresso da escala" message={message} />;
  }

  const itemCounts = countItemsByRepertoire(itemResult.data);
  const studiedCounts = countStudiedByRepertoire(progressResult.data);
  const rows = (repertoires as any[]).map((repertoire) => ({
    ...repertoire,
    kitCount: itemCounts.get(String(repertoire.id)) ?? 0,
    studiedCount: studiedCounts.get(String(repertoire.id)) ?? 0,
  })) as RepertoireRow[];

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#050816] via-[#080b18] to-[#06070c] px-4 py-8 text-white md:px-8">
        <section className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#06111f] p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              <ShieldCheck className="h-4 w-4" /> Premium via Ministério
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">Minha Escala</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
              Escalas e cultos compartilhados por {ministry?.name ?? "seu ministério"} em formato de playlist ministerial.
            </p>
          </div>

          {rows.length ? (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((repertoire) => {
                const kitCount = repertoire.kitCount;
                return (
                  <article
                    key={repertoire.id}
                    className="group rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-xl transition hover:-translate-y-1 hover:border-cyan-300/35 hover:bg-white/[0.07]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100">
                        <ListMusic className="h-5 w-5" />
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-zinc-300">
                        {kitCount} música{kitCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <h2 className="mt-5 text-2xl font-black text-white group-hover:text-cyan-100">{repertoire.name}</h2>
                    {repertoire.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">{repertoire.description}</p> : null}
                    <div className="mt-5 grid gap-2 text-xs text-zinc-400">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        <span>Data: {repertoire.event_date ? formatDate(repertoire.event_date) : formatDate(repertoire.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Music2 className="h-4 w-4" />
                        <span>Quantidade de músicas: {kitCount}</span>
                      </div>
                      <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100">
                        <p className="text-sm font-black">{repertoire.studiedCount} de {kitCount} músicas estudadas</p>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-cyan-300" style={{ width: `${kitCount > 0 ? Math.round((repertoire.studiedCount / kitCount) * 100) : 0}%` }} />
                        </div>
                      </div>
                    </div>
                    <Link
                      href={`/meus-repertorios/${repertoire.id}`}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
                    >
                      Abrir escala <ArrowRight className="h-4 w-4" />
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-white/[0.04] p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                <Music2 className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-2xl font-black text-white">Nenhuma escala disponível ainda</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">
                Quando a liderança do ministério criar escalas, elas aparecerão aqui para você estudar como playlist.
              </p>
              <Link href="/todos-os-kits" className="mt-6 inline-flex rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
                Explorar kits
              </Link>
            </div>
          )}
        </section>
      </main>
    </PublicAppShell>
  );
}
