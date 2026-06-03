import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAdminHomePoll, updateHomePoll } from "@/lib/data/home-polls";
import { setFlashToast } from "@/lib/flash";

function parseOptions(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const normalized = line.replace(/^\d+[.)-]?\s*/, "").trim();
      const parts = normalized.split(" - ");
      return {
        label: parts[0]?.trim() || normalized,
        artist: parts.slice(1).join(" - ").trim() || null,
        description: null,
        order_index: index + 1,
      };
    });
}

interface EditEnquetePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEnquetePage({ params }: EditEnquetePageProps) {
  const { id } = await params;
  const poll = await getAdminHomePoll(id);
  if (!poll) notFound();

  const optionsText = poll.options
    .sort((a, b) => a.order_index - b.order_index)
    .map((option) => (option.artist ? `${option.label} - ${option.artist}` : option.label))
    .join("\n");

  async function savePoll(formData: FormData) {
    "use server";

    const question = String(formData.get("question") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const subtitle = String(formData.get("subtitle") ?? "").trim();
    const eyebrow = String(formData.get("eyebrow") ?? "").trim();
    const optionsRaw = String(formData.get("options") ?? "");

    try {
      await updateHomePoll({
        id,
        eyebrow: eyebrow || "Enquete Premium",
        question,
        title: title || null,
        subtitle: subtitle || null,
        active: formData.get("active") === "on",
        allow_guests: true,
        order_index: Number(formData.get("order_index") ?? 0),
        options: parseOptions(optionsRaw),
      });

      revalidatePath("/");
      revalidatePath("/admin/enquetes");
      revalidatePath(`/admin/enquetes/${id}`);
      await setFlashToast("success", "Enquete atualizada com sucesso.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível atualizar a enquete.");
      return;
    }

    redirect("/admin/enquetes");
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-300">Editar enquete</p>
          <h1 className="mt-2 text-3xl font-bold text-white">{poll.question}</h1>
          <p className="mt-1 text-sm text-zinc-400">Ajuste a pergunta, músicas e status da votação exibida na home.</p>
        </div>
        <Link href="/admin/enquetes" className="inline-flex justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/10">
          Voltar
        </Link>
      </div>

      <form action={savePoll} className="space-y-5 rounded-3xl border border-white/10 bg-surface p-5 shadow-premium md:p-7">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-zinc-200">Selo</span>
            <input name="eyebrow" defaultValue={poll.eyebrow} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-zinc-200">Ordem na home</span>
            <input name="order_index" type="number" defaultValue={poll.order_index} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Título visual</span>
          <input name="title" defaultValue={poll.title ?? ""} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Pergunta</span>
          <input name="question" required defaultValue={poll.question} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Subtítulo</span>
          <textarea name="subtitle" rows={3} defaultValue={poll.subtitle ?? ""} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Músicas da enquete</span>
          <textarea name="options" required rows={8} defaultValue={optionsText} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
          <p className="text-xs text-zinc-500">Use uma música por linha. Pode escrever como: Música - Artista.</p>
        </label>

        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200">
          <input name="active" type="checkbox" defaultChecked={poll.active} className="h-4 w-4" />
          Ativar enquete na home
        </label>

        {poll.totalVotes > 0 ? (
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4">
            <p className="text-sm font-semibold text-cyan-100">Atenção</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Esta enquete já possui {poll.totalVotes} voto(s). Alterar opções pode reorganizar o relatório e apagar a associação das opções antigas.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link href="/admin/enquetes" className="inline-flex justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/10">Cancelar</Link>
          <button className="inline-flex justify-center rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 text-sm font-black text-slate-950 hover:brightness-110">Salvar alterações</button>
        </div>
      </form>
    </section>
  );
}
