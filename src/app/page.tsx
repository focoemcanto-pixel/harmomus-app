import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getPlans } from "@/lib/data/plans";
import { getPublishedKits } from "@/lib/data/public-kits";

export const revalidate = 300;

const TESTIMONIALS = [
  {
    name: "Ana R.",
    role: "Líder de louvor",
    text: "Os kits do Harmomus me fazem chegar segura no tom certo. A preparação ficou mais rápida e consistente.",
  },
  {
    name: "Daniel M.",
    role: "Ministro de música",
    text: "A organização por artista e os tons prontos pouparam ensaio e elevaram a qualidade da equipe vocal.",
  },
  {
    name: "Carla P.",
    role: "Cantora",
    text: "A experiência premium ajuda a focar no chamado sem perder tempo procurando versões ou cifras soltas.",
  },
];

const HARMONY_COURSE_URL = "/comunidade";

function PlanCard({ name, slug, description }: { name: string; slug: string; description: string | null }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_0_40px_rgba(56,189,248,0.08)] backdrop-blur">
      <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">{slug}</p>
      <h3 className="mt-2 text-2xl font-semibold text-white">{name}</h3>
      <p className="mt-2 min-h-12 text-sm text-zinc-300">{description ?? "Plano Harmomus com acesso aos recursos do seu momento."}</p>
      <Link href="/assinar" className="mt-4 inline-flex rounded-lg border border-cyan-300/30 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20">
        Assinar {name}
      </Link>
    </article>
  );
}

export default async function HomePage() {
  const [kits, plans] = await Promise.all([getPublishedKits(), getPlans().catch(() => [])]);

  const latestKits = kits.slice(0, 8);
  const categories = Array.from(
    new Map(
      kits
        .filter((kit) => kit.category)
        .map((kit) => [kit.category!.slug, kit.category!]),
    ).values(),
  );

  const planBySlug = new Map(plans.map((plan) => [plan.slug.toLowerCase(), plan]));
  const fallbackPlans = [
    { slug: "free", name: "Free", description: "Acesso inicial para conhecer o Harmomus." },
    { slug: "plus", name: "Plus", description: "Mais recursos para evoluir sua rotina vocal." },
    { slug: "premium", name: "Premium", description: "Experiência completa para ministros e equipes." },
  ];

  return (
    <PublicAppShell>
      <main className="mx-auto w-full max-w-7xl space-y-8 px-4 pb-16 pt-6 md:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#121a30] via-[#090d18] to-[#05070d] p-6 md:p-10">
          <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="relative grid items-center gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Harmomus Premium</p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight text-white md:text-6xl">Prepare sua voz. Honre seu chamado.</h1>
              <p className="mt-4 max-w-2xl text-zinc-300">Kits vocais completos em todos os tons e vozes para você cantar com confiança, excelência e unção em cada ministração.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/todos-os-kits" className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">Acessar todos os kits</Link>
                <Link href="/assinar" className="rounded-xl border border-white/20 px-5 py-3 text-sm text-white transition hover:bg-white/10">Escolher plano</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {latestKits.slice(0, 4).map((kit) => (
                <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="group overflow-hidden rounded-2xl border border-white/15 bg-black/30">
                  {kit.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={kit.coverUrl} alt={kit.name} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="aspect-square w-full bg-gradient-to-br from-zinc-800 to-zinc-950" />
                  )}
                  <div className="p-2">
                    <p className="truncate text-xs text-zinc-200">{kit.name}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold text-white md:text-3xl">Últimos lançamentos</h2>
            <Link href="/todos-os-kits" className="text-sm text-cyan-200 hover:text-cyan-100">Ver todos</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {latestKits.length ? latestKits.map((kit) => (
              <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#0e1322] shadow-[0_0_32px_rgba(6,182,212,0.12)]">
                {kit.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={kit.coverUrl} alt={kit.name} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-zinc-900 to-[#141828] text-xs text-zinc-400">Harmomus</div>
                )}
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-white">{kit.name}</p>
                  <p className="truncate text-xs text-zinc-300">{kit.artist}</p>
                </div>
              </Link>
            )) : <div className="col-span-full rounded-2xl border border-white/10 p-8 text-center text-zinc-300">Sem lançamentos publicados ainda.</div>}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Artistas & Categorias</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.length ? categories.map((category) => (
              <Link key={category.id} href={`/categoria/${category.slug}`} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_0_30px_rgba(217,70,239,0.08)] transition hover:bg-white/10">
                <p className="text-lg font-semibold text-white">{category.name}</p>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-300">{category.description ?? "Veja todos os kits publicados desta categoria/artista."}</p>
                <span className="mt-4 inline-block text-xs uppercase tracking-[0.15em] text-cyan-200">Abrir artista</span>
              </Link>
            )) : <div className="rounded-2xl border border-white/10 p-6 text-zinc-300">Nenhuma categoria com kit publicado.</div>}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Depoimentos</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <article key={item.name} className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
                <p className="text-sm leading-relaxed text-zinc-200">“{item.text}”</p>
                <p className="mt-4 text-sm font-semibold text-white">{item.name}</p>
                <p className="text-xs text-cyan-200/80">{item.role}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Planos</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {fallbackPlans.map((defaultPlan) => {
              const plan = planBySlug.get(defaultPlan.slug);
              return <PlanCard key={defaultPlan.slug} slug={defaultPlan.slug} name={plan?.name ?? defaultPlan.name} description={plan?.description ?? defaultPlan.description} />;
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-300/20 bg-gradient-to-r from-cyan-900/30 to-indigo-900/30 p-7">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Curso Complementar</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Foco em Harmonia</h2>
          <p className="mt-3 max-w-2xl text-zinc-200">Aprofunde seu entendimento musical e ministre com mais consciência harmônica, técnica e liberdade criativa.</p>
          <Link href={HARMONY_COURSE_URL} className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900">Conhecer o Curso</Link>
        </section>

        <footer className="border-t border-white/10 pt-8">
          <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
            <Link href="https://youtube.com" target="_blank" className="hover:text-white">YouTube</Link>
            <Link href="https://instagram.com" target="_blank" className="hover:text-white">Instagram</Link>
            <Link href="/todos-os-kits" className="hover:text-white">Todos os Kits</Link>
            <Link href="/assinar" className="hover:text-white">Assinar</Link>
            <Link href="/login" className="hover:text-white">Login</Link>
          </div>
        </footer>
      </main>
    </PublicAppShell>
  );
}
