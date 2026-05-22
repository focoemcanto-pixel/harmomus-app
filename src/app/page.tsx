import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getPublishedKits } from "@/lib/data/public-kits";
import { getPublicHomeBanners } from "@/lib/data/home-banners";
import { HomeHeroCarousel } from "@/components/public/home-hero-carousel";
import { OFFICIAL_PLANS } from "@/lib/data/official-plans";
import { SubscribeButton } from "@/components/public/subscribe-button";

export const revalidate = 300;

const TESTIMONIALS = [
  {
    name: "Ana Rodrigues",
    role: "Líder de louvor • Igreja Verbo da Vida",
    text: "Com o Harmomus, meu time chegou no ensaio muito mais preparado. Os tons e vozes já prontos diminuíram retrabalho e elevaram o nível da ministração.",
    avatar: "AR",
  },
  {
    name: "Daniel Martins",
    role: "Diretor musical • Ministério Rio Worship",
    text: "A plataforma virou nosso streaming vocal diário. Encontramos kits novos toda semana, com acabamento profissional para cada voz da equipe.",
    avatar: "DM",
  },
  {
    name: "Carla Prado",
    role: "Cantora • Comunidade da Graça",
    text: "Antes eu perdia horas procurando referência. Agora entro, escolho a música e estudo com confiança. A experiência é realmente premium.",
    avatar: "CP",
  },
];

const HARMONY_COURSE_URL = "/comunidade";

const VOICE_SECTIONS = [
  { title: "Barítono", description: "Camada masculina de apoio com equilíbrio entre grave e brilho no médio." },
  { title: "Tenor", description: "Ataque definido no médio/agudo para trazer energia e presença nas entradas." },
  { title: "Contralto", description: "Camadas que preenchem o centro harmônico com textura e sustentação." },
  { title: "Soprano", description: "Linhas com brilho, extensão e firmeza para conduzir melodias com segurança." },
];

export default async function HomePage() {
  const [kits, homeBanners] = await Promise.all([getPublishedKits(), getPublicHomeBanners()]);

  const latestKits = kits.slice(0, 12);
  const categories = Array.from(new Map(kits.filter((kit) => kit.category).map((kit) => [kit.category!.slug, kit.category!])).values());
  const featuredCategories = categories.slice(0, 6);

  const categoryKitCount = kits.reduce<Record<string, number>>((acc, kit) => {
    if (kit.category?.slug) {
      acc[kit.category.slug] = (acc[kit.category.slug] ?? 0) + 1;
    }
    return acc;
  }, {});


  return (
    <PublicAppShell>
      <main className="mx-auto w-full max-w-[1320px] space-y-10 px-4 pb-16 pt-6 md:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.35),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.28),transparent_35%),linear-gradient(145deg,#030712,#070d1f_45%,#09051a)] p-6 md:p-10">
          <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-purple-500/30 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h1 className="mt-5 text-4xl font-semibold leading-tight text-white md:text-6xl">
                Prepare sua voz. Honre seu chamado.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-zinc-200 md:text-lg">
                Kits vocais completos em todos os tons e vozes para preparar seu ministério com excelência, segurança e unidade vocal.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/todos-os-kits" className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_40px_rgba(56,189,248,0.45)] transition hover:scale-[1.02]">
                  Explorar kits
                </Link>
                <SubscribeButton planSlug="premium" label="Experimentar grátis por 7 dias" className="rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-80" />
              </div>
            </div>

            <div className="relative">
              <HomeHeroCarousel banners={homeBanners.length ? homeBanners : latestKits.slice(0, 1).map((kit, index) => ({
                id: `fallback-${index}`,
                title: kit.name,
                subtitle: kit.artist,
                button_label: "Ver kit",
                button_href: `/biblioteca/${kit.slug}`,
                image_url: kit.coverUrl ?? "",
                mobile_image_url: null,
              }))} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold text-white md:text-3xl">Últimos lançamentos</h2>
            <Link href="/todos-os-kits" className="text-sm text-cyan-200 hover:text-cyan-100">Ver todos</Link>
          </div>
          <div className="flex snap-x gap-4 overflow-x-auto pb-2">
            {latestKits.length ? latestKits.map((kit) => (
              <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="group min-w-[210px] snap-start overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 to-white/5 shadow-[0_18px_40px_rgba(8,145,178,0.18)] transition hover:scale-[1.02] hover:border-cyan-200/80 md:min-w-[260px]">
                <div className="relative">
                  <span className="absolute left-3 top-3 z-10 rounded-full bg-fuchsia-500/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">Novo</span>
                  {kit.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={kit.coverUrl} alt={kit.name} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="aspect-square w-full bg-gradient-to-br from-zinc-900 to-[#141828]" />
                  )}
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-semibold text-white">{kit.name}</p>
                  <p className="truncate text-xs text-zinc-300">{kit.artist}</p>
                </div>
              </Link>
            )) : <div className="col-span-full rounded-2xl border border-white/10 p-8 text-center text-zinc-300">Sem lançamentos publicados ainda.</div>}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold text-white md:text-3xl">Artistas & Categorias</h2>
            <Link href="/categorias" className="text-sm text-cyan-200 hover:text-cyan-100">Acessar categorias</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredCategories.length ? featuredCategories.map((category) => (
              <Link key={category.id} href={`/categoria/${category.slug}`} className="group overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#101827] to-[#23123e] shadow-[0_18px_48px_rgba(76,29,149,0.24)] transition hover:-translate-y-1">
                {category.cover_url ? <img src={category.cover_url} alt={category.name} className="h-40 w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-40 items-center justify-center bg-gradient-to-br from-fuchsia-900/60 via-indigo-900/60 to-cyan-900/60 text-4xl font-bold text-white/90">{category.name.slice(0,1)}</div>}
                <div className="p-6">
                  <h3 className="text-2xl font-semibold text-white">{category.name}</h3>
                  <p className="mt-2 text-sm text-zinc-200">{categoryKitCount[category.slug] ?? 0} kits publicados</p>
                  <span className="mt-5 inline-flex text-sm text-cyan-100">Ver kits →</span>
                </div>
              </Link>
            )) : <div className="rounded-2xl border border-white/10 p-6 text-zinc-300">Nenhuma categoria com kit publicado.</div>}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/15 bg-gradient-to-br from-[#08142c] to-[#1b1140] p-7">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Como funciona</p>
            <h3 className="mt-3 text-3xl font-semibold text-white">Do clique ao ensaio em minutos</h3>
            <ol className="mt-4 space-y-3 text-zinc-200">
              <li>1. Escolha a música ou artista no catálogo.</li>
              <li>2. Selecione voz e tonalidade ideal.</li>
              <li>3. Monte playlists e ensaie com segurança.</li>
              <li>4. Ministre com unidade e excelência no vocal.</li>
            </ol>
            <Link href="/todos-os-kits" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900">Começar agora</Link>
          </article>
          <article className="rounded-3xl border border-white/15 bg-gradient-to-br from-[#17082f] to-[#2c0e25] p-7">
            <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-200">Vozes no Harmomus</p>
            <h3 className="mt-3 text-3xl font-semibold text-white">Estrutura vocal pensada para ministérios</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {VOICE_SECTIONS.map((voice) => (
                <div key={voice.title} className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <p className="text-sm font-semibold text-white">{voice.title}</p>
                  <p className="mt-1 text-xs text-zinc-200">{voice.description}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Depoimentos</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <article key={item.name} className="rounded-2xl border border-white/15 bg-gradient-to-br from-white/12 to-white/5 p-6 shadow-[0_15px_45px_rgba(6,182,212,0.12)] backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-400/30 text-sm font-semibold text-white">{item.avatar}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <p className="text-xs text-cyan-100">{item.role}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-zinc-200">“{item.text}”</p>
                <p className="mt-4 text-amber-300">★★★★★</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Planos</h2>
          <div className="grid gap-4 xl:grid-cols-3">
            {OFFICIAL_PLANS.map((plan) => {
              const isPopular = plan.popular;

              return (
                <article key={plan.slug} className={`relative rounded-3xl border p-6 ${isPopular ? "border-fuchsia-300/70 bg-gradient-to-b from-fuchsia-500/20 via-[#181329] to-[#0b1020] shadow-[0_20px_60px_rgba(217,70,239,0.3)]" : "border-white/15 bg-white/[0.04]"}`}>
                  {isPopular ? <span className="absolute -top-3 right-6 rounded-full bg-fuchsia-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white">Mais Popular</span> : null}
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">{plan.slug}</p>
                  <h3 className="mt-2 text-3xl font-semibold text-white">{plan.name}</h3>
                  <p className="mt-1 text-zinc-200">{plan.description}</p>
                  <p className="mt-4 text-3xl font-bold text-white">{plan.price}</p>
                  <p className="text-xs text-cyan-100">{plan.offer ? `Oferta: ${plan.offer}` : "Sem fidelidade"}</p>

                  <ul className="mt-5 space-y-2">
                    {plan.features.map((benefit) => (
                      <li key={benefit.label} className="flex items-center gap-2 text-sm text-zinc-100">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${benefit.included ? "bg-emerald-500/25 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                          {benefit.included ? "✓" : "✕"}
                        </span>
                        {benefit.label}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <SubscribeButton
                      planSlug={plan.slug as "free" | "plus" | "premium"}
                      label={plan.cta}
                      className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-80 ${isPopular ? "bg-gradient-to-r from-cyan-300 to-fuchsia-300 text-slate-950 hover:opacity-90" : "border border-white/30 bg-white/10 text-white hover:bg-white/20"}`}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-300/30 bg-gradient-to-r from-cyan-900/40 via-indigo-900/35 to-fuchsia-900/30 p-7">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Curso complementar</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Foco em Harmonia</h2>
          <p className="mt-3 max-w-2xl text-zinc-100">Desenvolva percepção harmônica, afinação e independência vocal para dividir vozes com segurança no ministério.</p>
          <ul className="mt-4 grid gap-2 text-sm text-zinc-100 md:grid-cols-3">
            <li>✓ Identificação de terças</li>
            <li>✓ Percepção & afinação</li>
            <li>✓ Divisão vocal prática</li>
            <li>✓ Aplicação em ensaio real</li>
          </ul>
          <Link href={HARMONY_COURSE_URL} className="mt-5 inline-flex rounded-xl bg-white px-6 py-3 text-sm font-bold text-slate-900">Conhecer o Curso</Link>
        </section>

        <footer className="rounded-3xl border border-white/10 bg-black/30 p-6">
          <div className="grid gap-6 md:grid-cols-4">
            <div>
              <p className="text-lg font-semibold text-white">Harmomus</p>
              <p className="mt-2 text-sm text-zinc-300">Plataforma vocal premium para equipes de louvor que buscam excelência musical.</p>
            </div>
            <div className="text-sm text-zinc-300">
              <p className="mb-2 font-semibold text-white">Navegação</p>
              <div className="space-y-1">
                <Link href="/todos-os-kits" className="block hover:text-white">Todos os Kits</Link>
                <Link href="/biblioteca" className="block hover:text-white">Biblioteca</Link>
                <Link href="/assinar" className="block hover:text-white">Planos</Link>
                <Link href="/login" className="block hover:text-white">Login</Link>
              </div>
            </div>
            <div className="text-sm text-zinc-300">
              <p className="mb-2 font-semibold text-white">Comunidade</p>
              <div className="space-y-1">
                <Link href="/comunidade" className="block hover:text-white">Curso Foco em Harmonia</Link>
                <Link href="/membros" className="block hover:text-white">Área de Membros</Link>
              </div>
            </div>
            <div className="text-sm text-zinc-300">
              <p className="mb-2 font-semibold text-white">Redes</p>
              <div className="space-y-1">
                <Link href="https://youtube.com" target="_blank" className="block hover:text-white">YouTube</Link>
                <Link href="https://instagram.com" target="_blank" className="block hover:text-white">Instagram</Link>
              </div>
            </div>
          </div>
          <p className="mt-6 border-t border-white/10 pt-4 text-xs text-zinc-400">© {new Date().getFullYear()} Harmomus. Todos os direitos reservados.</p>
        </footer>
      </main>
    </PublicAppShell>
  );
}
