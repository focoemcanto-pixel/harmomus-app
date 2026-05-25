type PremiumKitGateCardProps = {
  mode?: "guest" | "upgrade";
};

export function PremiumKitGateCard({ mode = "upgrade" }: PremiumKitGateCardProps) {
  const isGuest = mode === "guest";
  const headline = isGuest ? "Entre para acessar os kits do Harmomus" : "Desbloqueie a experiência completa Harmomus";
  const subtitle = isGuest
    ? "Crie sua conta gratuita ou entre para continuar estudando com kits vocais, vozes organizadas e uma experiência feita para quem serve no ministério."
    : "Estude divisões vocais com biblioteca completa, playlists, modulação inteligente e recursos avançados criados para acelerar seu estudo no ministério.";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#161a2d_0%,#07090f_42%,#030407_100%)] px-4 py-5 text-white sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-10 h-56 w-56 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="absolute -right-20 top-24 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="absolute bottom-8 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>

      <section className="relative mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/80 via-zinc-950/75 to-black/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="mb-4 flex flex-wrap gap-2">
            {(isGuest ? ["Conta gratuita", "Kits vocais", "Experiência Harmomus"] : ["Premium Experience", "Modulação inteligente", "Player avançado"]).map((badge) => (
              <span key={badge} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-wide text-zinc-100">
                {badge}
              </span>
            ))}
          </div>

          <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{headline}</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300 sm:text-base">{subtitle}</p>

          <div className="mt-5 rounded-3xl border border-white/10 bg-black/35 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Preview da experiência</p>
              <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-100">Vozes organizadas</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-cyan-400/15 via-violet-500/15 to-fuchsia-500/15 p-3">
              <div className="mb-2 h-2 rounded-full bg-white/15">
                <div className="h-2 w-2/3 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400" />
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>02:34</span>
                <span>04:56</span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {isGuest ? (
              <>
                <a
                  href="/cadastro?plan=free"
                  className="group inline-flex items-center justify-center rounded-3xl border border-cyan-300/30 bg-gradient-to-r from-cyan-300/90 to-violet-400/90 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_8px_24px_rgba(56,189,248,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(139,92,246,0.45)]"
                >
                  Criar conta grátis
                </a>
                <a
                  href="/login"
                  className="inline-flex items-center justify-center rounded-3xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-zinc-100 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10"
                >
                  Já tenho conta
                </a>
              </>
            ) : (
              <>
                <a
                  href="/assinar?plan=premium"
                  className="group inline-flex items-center justify-center rounded-3xl border border-cyan-300/30 bg-gradient-to-r from-cyan-300/90 to-violet-400/90 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_8px_24px_rgba(56,189,248,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(139,92,246,0.45)]"
                >
                  ✨ Desbloquear Premium
                </a>
                <a
                  href="/assinar?plan=plus"
                  className="inline-flex items-center justify-center rounded-3xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-zinc-100 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10"
                >
                  Ver plano Plus
                </a>
              </>
            )}
          </div>
        </div>

        {isGuest ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4">
              <h2 className="text-sm font-semibold text-cyan-200">🎧 Ouça</h2>
              <p className="mt-2 text-sm text-zinc-300">Acesse kits liberados e estude vozes separadas.</p>
            </article>
            <article className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4">
              <h2 className="text-sm font-semibold text-cyan-200">🎼 Organize</h2>
              <p className="mt-2 text-sm text-zinc-300">Navegue por músicas, artistas e tons com mais clareza.</p>
            </article>
            <article className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4">
              <h2 className="text-sm font-semibold text-cyan-200">🚀 Evolua</h2>
              <p className="mt-2 text-sm text-zinc-300">Comece grátis e desbloqueie recursos quando quiser.</p>
            </article>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4">
                <h2 className="text-sm font-semibold text-cyan-200">🎧 PLUS</h2>
                <ul className="mt-3 space-y-2 text-sm text-zinc-200">
                  <li>• Biblioteca completa liberada</li>
                  <li>• Playlists personalizadas</li>
                  <li>• Kits sem limite diário</li>
                  <li>• Estudo contínuo e organizado</li>
                </ul>
              </article>

              <article className="rounded-3xl border border-violet-300/30 bg-gradient-to-b from-violet-500/15 to-cyan-400/10 p-4 shadow-[0_10px_32px_rgba(56,189,248,0.15)]">
                <h2 className="text-sm font-semibold text-violet-100">👑 PREMIUM</h2>
                <ul className="mt-3 space-y-2 text-sm text-zinc-100">
                  <li>• Alteração inteligente de tom</li>
                  <li>• Modulação vocal avançada</li>
                  <li>• Solicitação de novos tons</li>
                  <li>• Pedidos de novas músicas</li>
                  <li>• Recursos avançados do player</li>
                </ul>
              </article>
            </div>

            <article className="rounded-3xl border border-white/10 bg-black/35 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Comparativo rápido</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs font-semibold text-zinc-300">FREE</p>
                  <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                    <li>• 3 kits por dia</li>
                    <li>• Sem playlists</li>
                    <li>• Sem troca de tom</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-cyan-300/25 bg-gradient-to-br from-cyan-400/10 to-violet-500/10 p-3">
                  <p className="text-xs font-semibold text-cyan-100">PREMIUM</p>
                  <ul className="mt-2 space-y-1 text-sm text-zinc-100">
                    <li>• Acesso ilimitado</li>
                    <li>• Playlists inteligentes</li>
                    <li>• Alteração de tom</li>
                    <li>• Recursos avançados</li>
                  </ul>
                </div>
              </div>
            </article>
          </>
        )}
      </section>
    </main>
  );
}