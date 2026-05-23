import Link from "next/link";

export default function CadastroSucessoPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#17213a_0%,#07080f_42%,#020207_100%)] px-4 py-8 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.22),transparent_35%),radial-gradient(circle_at_20%_70%,rgba(34,211,238,0.14),transparent_32%)]" />

      <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-4xl overflow-hidden rounded-[2.2rem] border border-cyan-300/15 bg-white/[0.04] shadow-[0_0_120px_rgba(34,211,238,0.12)] backdrop-blur-2xl">
          <div className="relative overflow-hidden border-b border-white/10 px-7 py-10 text-center md:px-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_55%)]" />

            <div className="relative z-10">
              <div className="mx-auto mb-6 flex items-center justify-center gap-3">
                <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-2xl font-bold text-white shadow-[0_0_34px_rgba(129,140,248,0.25)]">
                  H
                </div>
                <p className="text-3xl font-semibold tracking-tight text-white">
                  Harmo<span className="bg-gradient-to-r from-cyan-200 to-violet-400 bg-clip-text text-transparent">mus</span>
                </p>
              </div>

              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-5xl shadow-[0_0_50px_rgba(16,185,129,0.2)]">
                🎉
              </div>

              <p className="mb-3 text-sm uppercase tracking-[0.35em] text-emerald-300">
                Conta criada com sucesso
              </p>

              <h1 className="text-4xl font-bold text-white md:text-6xl">
                Bem-vindo ao Harmomus
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl">
                Sua conta gratuita já está ativa. Agora você pode começar seus estudos vocais com uma experiência premium e organizada como Spotify + YouTube Music.
              </p>
            </div>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-[1.1fr_0.9fr] md:p-10">
            <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-cyan-200">
                    Seu plano atual
                  </p>
                  <h2 className="mt-2 text-3xl font-bold text-white">
                    Free
                  </h2>
                </div>

                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                  Conta ativa
                </div>
              </div>

              <div className="mt-7 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-semibold text-white">✓ Biblioteca pública</p>
                  <p className="mt-1 text-sm text-zinc-400">Acesse kits gratuitos disponíveis na plataforma.</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-semibold text-white">✓ Criação de playlists</p>
                  <p className="mt-1 text-sm text-zinc-400">Monte sequências de estudo e ensaio.</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-semibold text-white">✓ Player premium</p>
                  <p className="mt-1 text-sm text-zinc-400">Troque tons, vozes e organize seus estudos.</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 to-cyan-400/10 p-6">
              <div className="absolute right-[-50px] top-[-50px] h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

              <div className="relative z-10">
                <p className="text-sm uppercase tracking-[0.25em] text-violet-200">
                  Upgrade disponível
                </p>

                <h2 className="mt-3 text-3xl font-bold text-white">
                  Teste o Premium
                </h2>

                <p className="mt-3 text-zinc-200">
                  Desbloqueie todos os recursos do Harmomus por 7 dias e experimente a plataforma completa.
                </p>

                <div className="mt-6 space-y-3 text-sm text-zinc-100">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">✓ Todos os kits vocais desbloqueados</div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">✓ Tons e nipes ilimitados</div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">✓ Playlists avançadas</div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">✓ Atualizações premium</div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">✓ Experiência completa de estudo</div>
                </div>

                <Link
                  href="/assinar"
                  className="mt-7 inline-flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-base font-bold text-black transition hover:scale-[1.01]"
                >
                  Atualize hoje e teste por 7 dias
                </Link>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-white/10 px-6 py-6 md:flex-row md:justify-center md:px-10">
            <Link href="/" className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 text-base font-semibold text-white transition hover:bg-white/10">
              Voltar para Home
            </Link>

            <Link href="/biblioteca" className="inline-flex h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-8 text-base font-bold text-black transition hover:scale-[1.02]">
              Acessar kits
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
