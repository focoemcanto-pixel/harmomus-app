import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ListMusic, Music2, ShieldCheck } from "lucide-react";

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
  ministry_repertoire_items?: { id: string }[];
};

function formatDate(value?: string | null, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function MeusRepertoriosPage() {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) redirect("/login");
  if (!context.ministry?.ministryId) redirect("/");

  const admin = createSupabaseAdminClient() as any;

  const [{ data: ministry }, { data: repertoires, error }] = await Promise.all([
    admin.from("ministries").select("id,name").eq("id", context.ministry.ministryId).maybeSingle(),
    admin
      .from("ministry_repertoires")
      .select("id,name,description,event_date,created_at,ministry_repertoire_items(id)")
      .eq("ministry_id", context.ministry.ministryId)
      .eq("archived", false)
      .order("event_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  if (error) throw new Error(error.message);

  const rows = (repertoires ?? []) as RepertoireRow[];

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#050816] via-[#080b18] to-[#06070c] px-4 py-8 text-white md:px-8">
        <section className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#06111f] p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              <ShieldCheck className="h-4 w-4" /> Premium via Ministério
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">Meus Repertórios</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
              Repertórios compartilhados por {ministry?.name ?? "seu ministério"} para você estudar os kits definidos pela liderança.
            </p>
          </div>

          {rows.length ? (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((repertoire) => {
                const kitCount = repertoire.ministry_repertoire_items?.length ?? 0;
                return (
                  <Link
                    key={repertoire.id}
                    href={`/meus-repertorios/${repertoire.id}`}
                    className="group rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-xl transition hover:-translate-y-1 hover:border-cyan-300/35 hover:bg-white/[0.07]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100">
                        <ListMusic className="h-5 w-5" />
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-zinc-300">
                        {kitCount} kit{kitCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <h2 className="mt-5 text-2xl font-black text-white group-hover:text-cyan-100">{repertoire.name}</h2>
                    {repertoire.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">{repertoire.description}</p> : null}
                    <div className="mt-5 flex items-center gap-2 text-xs text-zinc-400">
                      <CalendarDays className="h-4 w-4" />
                      {repertoire.event_date ? formatDate(repertoire.event_date) : `Criado em ${formatDate(repertoire.created_at)}`}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-white/[0.04] p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                <Music2 className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-2xl font-black text-white">Nenhum repertório disponível ainda</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">
                Quando a liderança do ministério criar repertórios, eles aparecerão aqui para você estudar.
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
