import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="text-lg font-semibold tracking-wide text-white">
          Harmomus
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-zinc-200 transition hover:border-gold-400/50 hover:text-white"
          >
            Entrar
          </button>
          <button
            type="button"
            className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20"
          >
            Assinar
          </button>
        </div>
      </div>
    </header>
  );
}
