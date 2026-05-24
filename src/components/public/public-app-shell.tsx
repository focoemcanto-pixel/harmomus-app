import Link from "next/link";

import { PublicShellClient } from "@/components/public/public-shell-client";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getPublishedKitSearchItems } from "@/lib/data/public-kits";

export async function PublicAppShell({ children }: { children: React.ReactNode }) {
  const [context, searchItems] = await Promise.all([
    getCurrentUserAccessContext(),
    getPublishedKitSearchItems(),
  ]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-2 md:h-20 md:gap-3 md:px-8">
          <Link href="/" prefetch className="shrink-0 text-base font-semibold tracking-wide text-white md:text-xl">
            Harmomus
          </Link>

          <PublicShellClient context={context} searchItems={searchItems} />
        </div>
      </header>

      <div className="pt-16 md:pt-24">{children}</div>
    </main>
  );
}
