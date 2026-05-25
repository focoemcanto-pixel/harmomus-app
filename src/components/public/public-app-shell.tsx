import Link from "next/link";

import { PublicShellClient } from "@/components/public/public-shell-client";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getAdminSettings } from "@/lib/data/admin-settings";
import { getPublishedKitSearchItems } from "@/lib/data/public-kits";

export async function PublicAppShell({ children }: { children: React.ReactNode }) {
  const [context, searchItems, settings] = await Promise.all([
    getCurrentUserAccessContext(),
    getPublishedKitSearchItems(),
    getAdminSettings(),
  ]);

  const logoUrl = settings.branding.logoUrl;
  const appName = settings.branding.appName || "Harmomus";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-3 md:h-24 md:gap-5 md:px-8">
          <Link href="/" prefetch className="flex min-w-[132px] shrink-0 items-center gap-3 text-base font-semibold tracking-wide text-white sm:min-w-[178px] md:min-w-[260px] md:text-xl" aria-label={appName}>
            {logoUrl ? (
              <span className="flex h-12 w-[132px] items-center overflow-hidden sm:h-14 sm:w-[178px] md:h-20 md:w-[260px] lg:w-[300px]">
                <img src={logoUrl} alt={appName} className="h-full w-full origin-left scale-[2.2] object-contain object-left sm:scale-[2.35] md:scale-[2.55]" />
              </span>
            ) : (
              <span className="text-xl font-bold md:text-2xl">{appName}</span>
            )}
          </Link>

          <PublicShellClient context={context} searchItems={searchItems} />
        </div>
      </header>

      <div className="pt-20 md:pt-28">{children}</div>
    </main>
  );
}
