import Link from "next/link";

import { PublicHeader } from "@/components/public/public-header";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)]">
      <PublicHeader />
      <section className="mx-auto flex min-h-[calc(100vh-76px)] w-full max-w-7xl flex-col items-center justify-center px-4 py-10 text-center md:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Harmomus Premium</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold text-white md:text-6xl">A biblioteca pública para explorar kits e cantar em qualquer tom.</h1>
        <p className="mt-4 max-w-2xl text-zinc-300">Descubra kits publicados com experiência premium e acesso rápido à página de cada música.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/biblioteca"
            className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-6 py-3 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20"
          >
            Ir para biblioteca
          </Link>
          <Link href="/admin" className="rounded-lg border border-white/20 px-6 py-3 text-sm text-zinc-200 transition hover:text-white">
            Painel Harmomus
          </Link>
        </div>
      </section>
    </main>
  );
}
