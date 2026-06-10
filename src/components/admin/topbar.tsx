import Link from "next/link";

import { AdminGlobalSearch } from "@/components/admin/admin-global-search";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/90 px-3 py-3 shadow-premium backdrop-blur sm:mb-6 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <p className="truncate text-xs uppercase tracking-[0.2em] text-gold-300 sm:tracking-[0.25em]">Administração</p>
        <p className="truncate text-xs text-muted sm:text-sm">Central Harmomus Studio</p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <AdminGlobalSearch />
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/20 sm:px-4 sm:text-sm"
        >
          Ver site
        </Link>
      </div>
    </header>
  );
}
