import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getUserFavoriteKits } from "@/lib/data/favorites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

export default async function FavoritosPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");

  const favorites = await getUserFavoriteKits().catch(() => []);

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#06070d] to-[#101624] px-4 py-8 text-white md:px-8">
        <section className="mx-auto max-w-6xl">
          <Link href="/perfil" className="inline-flex rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-300/20">
            ← Voltar para perfil
          </Link>

          <div className="mt-6 rounded-[2rem] border border-rose-300/20 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl md:p-8">
            <p className="inline-flex items-center gap-2 rounded-full border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-rose-100">
              <Heart size={16} className="fill-current" /> Meus favoritos
            </p>
            <h1 className="mt-5 text-4xl font-black md:text-5xl">Kits salvos para estudar depois</h1>
            <p className="mt-3 max-w-2xl text-zinc-300">Aqui ficam os kits que você marcou com coração na biblioteca.</p>
          </div>

          {favorites.length ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.map((kit) => (
                <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-xl transition hover:-translate-y-1 hover:border-rose-300/40 hover:bg-white/[0.07]">
                  <div className="aspect-video overflow-hidden bg-zinc-950">
                    {kit.cover_url ? (
                      <img src={kit.cover_url} alt={kit.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="grid h-full place-items-center text-zinc-500">Harmomus</div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-100">
                      <Heart size={14} className="fill-current" /> Favoritado
                    </div>
                    <h2 className="text-xl font-black text-white">{kit.name}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{kit.artist ?? "Kit vocal"}</p>
                    <p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-500">Salvo em {formatDate(kit.favorited_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-zinc-300">
              Você ainda não favoritou nenhum kit. Abra um kit na biblioteca e toque no botão de coração.
              <div className="mt-5">
                <Link href="/biblioteca" className="inline-flex rounded-2xl bg-gradient-to-r from-rose-400 to-cyan-300 px-5 py-3 font-black text-black">
                  Abrir biblioteca
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </PublicAppShell>
  );
}
