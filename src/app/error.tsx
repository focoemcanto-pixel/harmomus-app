"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("Route error", error);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-lg rounded-3xl border border-white/10 bg-surface/90 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 text-4xl">
          ⚠️
        </div>

        <h2 className="text-3xl font-black text-white">Erro temporário</h2>

        <p className="mt-3 text-sm leading-relaxed text-white/70">
          A página encontrou uma instabilidade momentânea. Isso normalmente acontece por sincronização de cache ou conexão.
        </p>

        <button
          onClick={() => reset()}
          className="mt-6 rounded-2xl bg-cyan-400 px-6 py-3 font-bold text-black transition hover:scale-[1.02]"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
