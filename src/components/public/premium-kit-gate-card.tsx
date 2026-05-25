import Link from "next/link";

const playerBars = [18, 34, 24, 46, 30, 58, 36, 50, 28, 42, 62, 38, 52, 26, 44, 32, 56, 40, 30, 48, 22, 36, 54, 34];

function FeaturePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      {children}
    </span>
  );
}

function BenefitCard({ title, icon, children, highlighted = false }: { title: string; icon: string; children: React.ReactNode; highlighted?: boolean }) {
  return (
    <div className={`rounded-3xl border p-4 backdrop-blur-xl ${highlighted ? "border-cyan-300/25 bg-cyan-300/[0.055] shadow-[0_0_45px_rgba(34,211,238,0.10)]" : "border-white/10 bg-white/[0.035]"}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-base">{icon}</span>
        <h3 className={highlighted ? "text-sm font-bold uppercase tracking-[0.18em] text-cyan-100" : "text-sm font-bold uppercase tracking-[0.18em] text-zinc-100"}>{title}</h3>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-300">{children}</div>
    </div>
  );
}

export function PremiumKitGateCard() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_42%,#030409_100%)] px-4 py-6 md:px-8 md:py-10">
      <section className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#090a12]/95 via-[#101425]/95 to-[#070711]/95 p-5 shadow-[0_0_90px_rgba(59,130,246,0.16)] backdrop-blur-2xl md:rounded-[2.5rem] md:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.20),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(168,85,247,0.20),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_32%)]" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="pointer-events-none absolute inset-x-5 top-8 hidden opacity-[0.12] blur-[0.2px] md:block">
          <div className="ml-auto w-[58%] rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-cyan-100/90">
              <span>Player avançado</span>
              <span>Tom • Eb</span>
            </div>
            <div className="flex h-24 items-end gap-1.5">
              {playerBars.map((height, index) => (
                <span key={index} className="w-1.5 rounded-full bg-cyan-200/80" style={{ height }} />
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex flex-wrap gap-2">
            <FeaturePill>Premium Experience</FeaturePill>
            <FeaturePill>Modulação inteligente</FeaturePill>
            <FeaturePill>Player avançado</FeaturePill>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-cyan-300/20 bg-cyan-300/10 text-4xl shadow-[0_0_40px_rgba(34,211,238,0.18)]">
                🔒
              </div>

              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/90">Você encontrou um kit premium</p>
              <h1 className="text-3xl font-black leading-tight text-white md:text-5xl">
                Desbloqueie a experiência completa Harmomus
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-300 md:text-lg">
                Estude divisões vocais com biblioteca completa, playlists, modulação inteligente e recursos avançados criados para acelerar seu estudo no ministério.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/assinar?plan=premium"
                  className="group inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-500 px-6 py-4 text-sm font-black uppercase tracking-[0.08em] text-slate-950 shadow-[0_0_35px_rgba(56,189,248,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_0_55px_rgba(56,189,248,0.42)]"
                >
                  ✨ Desbloquear Premium
                </Link>
                <Link
                  href="/assinar?plan=plus"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] px-6 py-4 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.08]"
                >
                  Ver plano Plus
                </Link>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
              <div className="rounded-[1.35rem] border border-cyan-300/15 bg-gradient-to-br from-white/[0.075] to-white/[0.02] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Prévia Premium</p>
                    <p className="mt-1 text-lg font-bold text-white">Player vocal inteligente</p>
                  </div>
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">Premium</span>
                </div>
                <div className="flex h-20 items-end gap-1.5 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                  {playerBars.slice(0, 18).map((height, index) => (
                    <span key={index} className="flex-1 rounded-full bg-gradient-to-t from-cyan-500/80 to-cyan-100/90" style={{ height: Math.max(12, height * 0.72) }} />
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-zinc-300">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><strong className="block text-white">Tom</strong> Inteligente</div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><strong className="block text-white">Vozes</strong> Separadas</div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><strong className="block text-white">Kits</strong> Ilimitados</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <BenefitCard title="Plus" icon="🎧">
              <p>✅ Biblioteca completa liberada</p>
              <p>✅ Playlists personalizadas</p>
              <p>✅ Kits sem limite diário</p>
              <p>✅ Estudo contínuo e organizado</p>
            </BenefitCard>

            <BenefitCard title="Premium" icon="👑" highlighted>
              <p>✨ Alteração inteligente de tom</p>
              <p>✨ Modulação vocal avançada</p>
              <p>✨ Solicitação de novos tons</p>
              <p>✨ Pedidos de novas músicas</p>
              <p>✨ Recursos avançados do player</p>
            </BenefitCard>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
            <div className="grid grid-cols-2 divide-x divide-white/10">
              <div className="p-4 md:p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Free</p>
                <div className="space-y-2 text-sm text-zinc-400">
                  <p>• 3 kits por dia</p>
                  <p>• Sem playlists</p>
                  <p>• Sem troca de tom</p>
                </div>
              </div>
              <div className="bg-cyan-300/[0.045] p-4 md:p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">Premium</p>
                <div className="space-y-2 text-sm text-zinc-100">
                  <p>+ Acesso ilimitado</p>
                  <p>+ Playlists inteligentes</p>
                  <p>+ Alteração de tom</p>
                  <p>+ Recursos avançados</p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-zinc-500 md:text-sm">
            O plano gratuito é uma degustação. O Plus e o Premium liberam uma experiência completa de estudo vocal com organização, profundidade e produtividade.
          </p>
        </div>
      </section>
    </main>
  );
}
