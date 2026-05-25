import { PublicAppShell } from "@/components/public/public-app-shell";
import { BibliotecaClient } from "@/components/public/biblioteca-client";

import { getPublishedKits } from "@/lib/data/public-kits";

export default async function BibliotecaPage() {
  const kits = await getPublishedKits();

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-6 rounded-2xl border border-white/10 bg-surface/80 p-5">
            <h1 className="text-2xl text-white">Biblioteca Pública</h1>
          </header>

          <BibliotecaClient kits={kits} />
        </div>
      </main>
    </PublicAppShell>
  );
}
