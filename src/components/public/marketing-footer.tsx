import Link from "next/link";

const ECOSYSTEM_LINKS = [
  { label: "Curso de Divisão Vocal", href: "https://focoemcanto.com/focoemharmonia/" },
  { label: "Mentoria Foco em Canto", href: "https://focoemcanto.com" },
  { label: "Aulas Individuais", href: "https://forms.gle/aR3cRBCWWsFPPwdv5" },
  { label: "Workshop na sua igreja", href: "https://wa.link/8delsj" },
];

const SOCIAL_LINKS = [
  { label: "YouTube", href: "https://www.youtube.com/@marcoscruzsan" },
  { label: "Spotify", href: "https://open.spotify.com/intl-pt/artist/4g2424f5ZilupXY9azFRl1" },
  { label: "Banda Harmonics", href: "https://bandaharmonics.com" },
];

export function MarketingFooter() {
  return (
    <footer className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_85%_15%,rgba(168,85,247,0.22),transparent_32%),linear-gradient(135deg,#050812,#0b1020_48%,#16071f)] p-7 shadow-[0_25px_80px_rgba(14,165,233,0.12)] md:p-10">
      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">Ecossistema Foco em Canto</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-white md:text-5xl">
            Prepare sua voz, fortaleça seu ministério e continue crescendo.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-200 md:text-lg">
            O Harmomus faz parte de uma jornada maior: estudo vocal, divisão de vozes, mentoria, aulas e conteúdos para quem deseja cantar com excelência e honrar o chamado.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/todos-os-kits" className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_16px_45px_rgba(34,211,238,0.25)] transition hover:brightness-110">
              Explorar kits
            </Link>
            <Link href="/assinar" className="inline-flex min-w-[180px] items-center justify-center rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20">
              Ver planos
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">Produtos</p>
            <div className="mt-4 space-y-2">
              {ECOSYSTEM_LINKS.map((item) => (
                <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-100 transition hover:border-cyan-300/50 hover:bg-white/[0.08]">
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-100">Canais</p>
            <div className="mt-4 space-y-2">
              {SOCIAL_LINKS.map((item) => (
                <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-100 transition hover:border-fuchsia-300/50 hover:bg-white/[0.08]">
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 text-sm text-zinc-400 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} Harmomus. Prepare sua voz, honre seu chamado.</p>
        <p>Foco em Canto • Harmomus • Banda Harmonics</p>
      </div>
    </footer>
  );
}
