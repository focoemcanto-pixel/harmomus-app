import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { createHomePoll } from '@/lib/data/home-polls';
import { setFlashToast } from '@/lib/flash';

function parseOptions(raw: string) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const normalized = line.replace(/^\d+[.)-]?\s*/, '').trim();
      const parts = normalized.split(' - ');
      return {
        label: parts[0]?.trim() || normalized,
        artist: parts.slice(1).join(' - ').trim() || null,
        description: null,
        order_index: index + 1,
      };
    });
}

export default function NovaEnquetePage() {
  async function savePoll(formData: FormData) {
    'use server';

    const question = String(formData.get('question') ?? '').trim();
    const title = String(formData.get('title') ?? '').trim();
    const subtitle = String(formData.get('subtitle') ?? '').trim();
    const eyebrow = String(formData.get('eyebrow') ?? '').trim();
    const optionsRaw = String(formData.get('options') ?? '');

    try {
      await createHomePoll({
        eyebrow: eyebrow || 'Enquete Premium',
        question,
        title: title || null,
        subtitle: subtitle || null,
        active: formData.get('active') === 'on',
        allow_guests: true,
        order_index: Number(formData.get('order_index') ?? 0),
        options: parseOptions(optionsRaw),
      });

      revalidatePath('/');
      revalidatePath('/admin/enquetes');
      await setFlashToast('success', 'Enquete criada com sucesso.');
    } catch (error) {
      await setFlashToast('error', error instanceof Error ? error.message : 'Não foi possível criar a enquete.');
      return;
    }

    redirect('/admin/enquetes');
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Nova enquete</h1>
        <p className="mt-1 text-sm text-zinc-400">Digite as músicas manualmente, uma por linha. Ideal para decidir o próximo kit vocal da semana.</p>
      </div>

      <form action={savePoll} className="space-y-5 rounded-3xl border border-white/10 bg-surface p-5 shadow-premium md:p-7">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-zinc-200">Selo</span>
            <input name="eyebrow" defaultValue="Enquete Premium" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-zinc-200">Ordem na home</span>
            <input name="order_index" type="number" defaultValue={0} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Título visual</span>
          <input name="title" defaultValue="Você decide o próximo kit" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Pergunta</span>
          <input name="question" required defaultValue="Qual Kit Vocal você quer ver aqui essa semana?" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Subtítulo</span>
          <textarea name="subtitle" rows={3} defaultValue="Vote e ajude a escolher o próximo lançamento do Harmomus." className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Músicas da enquete</span>
          <textarea
            name="options"
            required
            rows={8}
            defaultValue={`Sublime - FHOP\nNinguém Explica Deus - Preto no Branco\nAh, Jesus - Julliany Souza\nEmanuel - Ministério Zoe\nÚnico - Fernandinho`}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
          />
          <p className="text-xs text-zinc-500">Use uma música por linha. Pode escrever como: Música - Artista.</p>
        </label>

        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200">
          <input name="active" type="checkbox" defaultChecked className="h-4 w-4" />
          Ativar enquete imediatamente na home
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <a href="/admin/enquetes" className="inline-flex justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/10">Cancelar</a>
          <button className="inline-flex justify-center rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 text-sm font-black text-slate-950 hover:brightness-110">Salvar enquete</button>
        </div>
      </form>
    </section>
  );
}
