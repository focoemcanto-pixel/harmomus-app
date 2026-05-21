import Link from "next/link";

import { PublicShellClient } from "@/components/public/public-shell-client";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getPublishedKits } from "@/lib/data/public-kits";

export async function PublicAppShell({ children }: { children: React.ReactNode }) {
  const [context, kits] = await Promise.all([getCurrentUserAccessContext(), getPublishedKits()]);

  const searchItems = kits.slice(0, 250).map((kit) => ({
    id: kit.id,
    slug: kit.slug,
    name: kit.name,
    artist: kit.artist,
    category: kit.category?.name ?? "Sem categoria",
    searchText: `${kit.name} ${kit.artist} ${kit.category?.name ?? ""}`.toLowerCase(),
  }));

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-3 md:h-20 md:px-8">
          <Link href="/" className="text-lg font-semibold tracking-wide text-white md:text-xl">Harmomus</Link>
          <PublicShellClient context={context} searchItems={searchItems} />
        </div>
      </header>
      <div className="pt-20 md:pt-24">{children}</div>
    </main>
  );
}
