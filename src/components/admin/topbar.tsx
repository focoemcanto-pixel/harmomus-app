import Link from "next/link";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 mb-6 flex items-center justify-between rounded-xl border border-border bg-surface/80 px-5 py-4 shadow-premium backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gold-300">Administração</p>
        <p className="text-sm text-muted">Central Harmomus Studio</p>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/"
          target="_blank"
          className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
        >
          Ver site
        </Link>

        <div className="rounded-full border border-gold-500/40 bg-surface-muted px-4 py-2 text-sm text-foreground">
          Modo Dark Premium
        </div>
      </div>
    </header>
  );
}
