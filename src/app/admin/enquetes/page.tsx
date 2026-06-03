import Link from "next/link";
import { revalidatePath } from "next/cache";

import { deleteHomePoll, getAdminHomePolls, setHomePollActive } from "@/lib/data/home-polls";
import { setFlashToast } from "@/lib/flash";

function leaderOf(poll: Awaited<ReturnType<typeof getAdminHomePolls>>[number]) {
  return [...poll.options].sort((a, b) => b.voteCount - a.voteCount)[0] ?? null;
}

export default async function AdminEnquetesPage() {
  const polls = await getAdminHomePolls();
  const activePolls = polls.filter((poll) => poll.active).length;
  const totalVotes = polls.reduce((sum, poll) => sum + poll.totalVotes, 0);

  async function activatePoll(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    try {
      await setHomePollActive(id, true);
      revalidatePath("/");
      revalidatePath("/admin/enquetes");
      await setFlashToast("success", "Enquete ativada. As demais foram desativadas automaticamente.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível ativar a enquete.");
    }
  }

  async function deactivatePoll(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    try {
      await setHomePollActive(id, false);
      revalidatePath("/");
      revalidatePath("/admin/enquetes");
      await setFlashToast("success", "Enquete desativada.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível desativar a enquete.");
    }
  }

  async function removePoll(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    try {
      await deleteHomePoll(id);
      revalidatePath("/");
      revalidatePath("/admin/enquetes");
      await setFlashToast("success", "Enquete excluída com sucesso.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível excluir a enquete.");
    }
  }

  return (
    <section className="space-y-7">
      <div className="flex flex-col gap-4 rounded-3xl border border-gold-500/20 bg-gradient-to-br from-gold-500/10 via-surface to-background p-5 shadow-premium md:flex-row md:items-end md:justify-between md:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-300">Home • Engajamento</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Enquetes</h1>
          <p className="mt-1 text-sm text-zinc-400">Crie votações para o público escolher os próximos kits vocais do Harmomus.</p>
        </div>
        <Link href="/admin/enquetes/nova" className="inline-flex justify-center rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 text-sm font-black text-slate-950 hover:brightness-110">
          Nova enquete
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Enquetes</p>
          <p className="mt-2 text-3xl font-bold text-white">{polls.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Ativas</p>
          <p className="mt-2 text-3xl font-bold text-white">{activePolls}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Votos totais</p>
          <p className="mt-2 text-3xl font-bold text-white">{totalVotes}</p>
        </div>
      </div>

      <div className="grid gap-5">
        {polls.length ? polls.map((poll) => {
          const leader = leaderOf(poll);
          return (
            <article key={poll.id} className="overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-premium">
              <div className="flex flex-col gap-4 border-b border-white/10 p-5 md:flex-row md:items-start md:justify-between md:p-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${poll.active ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200" : "border border-zinc-400/30 bg-zinc-500/15 text-zinc-300"}`}>
                      {poll.active ? "Ativa na home" : "Inativa"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-zinc-300">{poll.totalVotes} votos</span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-white">{poll.question}</h2>
                  {poll.subtitle ? <p className="mt-1 text-sm text-zinc-400">{poll.subtitle}</p> : null}
                  {leader ? <p className="mt-3 text-sm text-cyan-100">🏆 Liderando: <strong>{leader.label}</strong>{leader.artist ? ` — ${leader.artist}` : ""}</p> : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={poll.active ? deactivatePoll : activatePoll}>
                    <input type="hidden" name="id" value={poll.id} />
                    <button className={`rounded-xl px-4 py-2 text-sm font-semibold ${poll.active ? "border border-zinc-400/30 bg-zinc-500/10 text-zinc-200 hover:bg-zinc-500/20" : "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"}`}>
                      {poll.active ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                  <Link href={`/admin/enquetes/${poll.id}`} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/20">
                    Editar
                  </Link>
                  <form action={removePoll}>
                    <input type="hidden" name="id" value={poll.id} />
                    <button className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20">
                      Excluir
                    </button>
                  </form>
                </div>
              </div>

              <div className="space-y-3 p-5 md:p-6">
                {poll.options.map((option) => (
                  <div key={option.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{option.label}</p>
                        {option.artist ? <p className="truncate text-xs text-zinc-400">{option.artist}</p> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-white">{option.percent}%</p>
                        <p className="text-xs text-zinc-500">{option.voteCount} votos</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-300" style={{ width: `${option.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        }) : (
          <div className="rounded-3xl border border-white/10 bg-surface p-8 text-center text-zinc-400">
            Nenhuma enquete cadastrada ainda.
          </div>
        )}
      </div>
    </section>
  );
}
