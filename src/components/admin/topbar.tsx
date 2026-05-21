export function Topbar() {
  return (
    <header className="sticky top-0 z-20 mb-6 flex items-center justify-between rounded-xl border border-border bg-surface/80 px-5 py-4 shadow-premium backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gold-300">Administração</p>
        <p className="text-sm text-muted">Central Harmomus Studio</p>
      </div>
      <div className="rounded-full border border-gold-500/40 bg-surface-muted px-4 py-1 text-sm text-foreground">Modo Dark Premium</div>
    </header>
  );
}
