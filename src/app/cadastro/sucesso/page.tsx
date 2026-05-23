import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";

export default function CadastroSucessoPage() {
  return (
    <PublicAppShell>
      <section className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl rounded-[2rem] border border-emerald-400/20 bg-gradient-to-b from-emerald-500/10 to-black/40 p-8 text-center shadow-[0_0_80px_rgba(16,185,129,0.18)] backdrop-blur-2xl">
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
            <Link
              href="/"
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-8 text-base font-semibold text-black transition hover:scale-[1.02]"
            >
              Ir para Home
            </Link>

            <Link
              href="/perfil"
              className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 text-base font-semibold text-white transition hover:bg-white/10"
            >
              Meu perfil
            </Link>
          </div>
        </div>
      </section>
    </PublicAppShell>
  );
}
