"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("Global Harmomus error", error);

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-[#050816] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/15 text-3xl">
            ⚠️
          </div>

          <h1 className="text-3xl font-black">Algo saiu do tom.</h1>

          <p className="mt-3 text-sm leading-relaxed text-white/70">
            O Harmomus encontrou uma instabilidade temporária. Tente recarregar a página.
          </p>

          <button
            onClick={() => reset()}
            className="mt-6 rounded-2xl bg-cyan-400 px-5 py-3 font-bold text-black transition hover:scale-[1.02]"
          >
            Recarregar Harmomus
          </button>

          {error?.digest ? (
            <p className="mt-5 text-[11px] tracking-[0.2em] text-white/30">
              ERROR {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
