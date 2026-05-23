import Link from "next/link";

export default function CadastroSucessoPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#17213a_0%,#07080f_42%,#020207_100%)] px-4 py-8 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.22),transparent_35%),radial-gradient(circle_at_20%_70%,rgba(34,211,238,0.14),transparent_32%)]" />

      <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-3xl rounded-[2rem] border border-emerald-400/20 bg-white/[0.04] p-7 text-center shadow-[0_0_100px_rgba(16,185,129,0.18)] backdrop-blur-2xl md:p-10">
          <div className="mx-auto mb-7 flex items-center justify-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-2xl font-bold text-white shadow-[0_0_34px_rgba(129,140,248,0.25)]">
              H
            </div>
            <p className="text-3xl font-semibold tracking-tight text-white">
              Harmo<span className="bg-gradient-to-r from-cyan-200 to-violet-400 bg-clip-text text-transparent">mus</span>
            </p>
          </div>

          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-4xl">
            🎉
          </div>

          <p className="mb-3 text-sm uppercase tracking-[0.35em] text-emerald-300">
            Conta criada com sucesso
          </p>

          <h1 className="text-4xl font-bold text-white md:text-5xl">
            Bem-vindo ao Harmomus
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-zinc-300">
            Sua conta já está pronta. Agora você pode explorar kits vocais, criar playlists, estudar divisões e preparar sua voz com uma experiência premium.
          </p>

          <div className="mt-8 grid gap-4 rounded-3xl border border-white/10 bg-black/30 p-6 text-left text-zinc-200 md:grid-cols-2">
            <div>
              <p className="font-semibold text-white">✓ Explore o catálogo</p>
              <p className="mt-1 text-sm text-zinc-400">Encontre kits por artista, música ou categoria.</p>
            </div>
            <div>
              <p className="font-semibold text-white">✓ Monte playlists</p>
              <p className="mt-1 text-sm text-zinc-400">Organize seus estudos como Spotify e YouTube Music.</p>
            </div>
            <div>
              <p className="font-semibold text-white">✓ Estude divisão vocal</p>
              <p className="mt-1 text-sm text-zinc-400">Ouça vozes separadas e desenvolva independência auditiva.</p>
            </div>
            <div>
              <p className="font-semibold text-white">✓ Continue evoluindo</p>
              <p className="mt-1 text-sm text-zinc-400">Prepare sua voz e honre seu chamado.</p>
            </div>
          </div>

          <div className="mt-10 flex flex-col justify-center gap-4 md:flex-row">
            <Link href="/" className="inline-flex h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-8 text-base font-semibold text-black transition hover:scale-[1.02]">
              Ir para Home
            </Link>
            <Link href="/perfil" className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 text-base font-semibold text-white transition hover:bg-white/10">
              Meu perfil
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
