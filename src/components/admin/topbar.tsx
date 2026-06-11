import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";

import { AdminGlobalSearch } from "@/components/admin/admin-global-search";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 mb-3 flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface/90 px-3 py-2 shadow-premium backdrop-blur sm:mb-6 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <p className="hidden text-xs uppercase tracking-[0.25em] text-gold-300 sm:block">Administração</p>
        <p className="truncate text-sm font-semibold text-foreground sm:text-sm sm:font-normal sm:text-muted">Harmomus Studio</p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">
          <AdminGlobalSearch />
        </div>
        <Link
          href="/admin"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/70 text-muted transition hover:text-foreground sm:hidden"
          aria-label="Buscar no admin"
        >
          <Search size={17} />
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/20 sm:px-4 sm:text-sm"
        >
          <span className="hidden xs:inline sm:inline">Ver site</span>
          <ExternalLink size={15} className="sm:hidden" />
        </Link>
      </div>
    </header>
  );
}
