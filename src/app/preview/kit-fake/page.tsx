export default function FakeKitPreviewPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] px-4 py-10 text-white">
      <section className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-surface/80 p-6 shadow-premium backdrop-blur md:p-8">
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          <div className="aspect-square rounded-xl border border-white/10 bg-[linear-gradient(135deg,#15161c,#2b2140)] p-6 shadow-premium">
            <div className="flex h-full items-center justify-center rounded-lg border border-white/10 text-center">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-gold-300">Harmomus</p>
                <h2 className="mt-3 text-3xl font-semibold">Kit Preview</h2>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-gold-300">Categoria Preview</p>
            <h1 className="mt-3 text-4xl font-semibold">Kit Vocal Preview</h1>
            <p className="mt-2 text-muted">Harmomus Studio</p>
            <div className="mt-6 grid gap-3">
              <select className="rounded-lg border border-white/10 bg-black/30 px-4 py-3"><option>Dó (C)</option><option>Ré (D)</option></select>
              <select className="rounded-lg border border-white/10 bg-black/30 px-4 py-3"><option>Todos juntos</option><option>Soprano</option><option>Contralto</option><option>Tenor</option></select>
            </div>
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5 shadow-premium">
              <div className="h-2 rounded-full bg-white/10"><div className="h-2 w-1/4 rounded-full bg-gold-300" /></div>
              <div className="mt-6 flex items-center justify-center gap-8 text-sm text-muted">
                <span>↻</span><span>⏮</span><button className="grid h-16 w-16 place-items-center rounded-full bg-white text-black">▶</button><span>⏭</span><span>🔊</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t border-white/10 pt-8">
          <h2 className="text-xl font-semibold">Letra</h2>
          <p className="mt-4 whitespace-pre-line text-muted">Primeira linha demonstrativa\nSegunda linha para visualizar espaçamento\nTerceira linha com frase de apoio\n\nRefrão demonstrativo\nLinha principal do refrão\nResposta vocal do grupo</p>
        </div>
      </section>
    </main>
  );
}
