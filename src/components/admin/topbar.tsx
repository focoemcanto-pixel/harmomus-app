import Link from "next/link";

import { AdminGlobalSearch } from "@/components/admin/admin-global-search";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface/85 px-4 py-4 shadow-premium backdrop-blur sm:px-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-300">Administração</p>
        <p className="text-sm text-muted">Central Harmomus Studio</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <AdminGlobalSearch />
        <div className="flex items-center gap-3">
          <Link
            href="/"
            target="_blank"
            className="inline-flex h-10 items-center rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
          >
            Ver site
          </Link>

          <div className="hidden rounded-full border border-gold-500/40 bg-surface-muted px-4 py-2 text-sm text-foreground sm:block">
            Dark Premium
          </div>
        </div>
      </div>
    </header>
  );
}
