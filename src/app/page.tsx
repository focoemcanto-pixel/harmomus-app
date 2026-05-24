import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { HomeHorizontalCarousel } from "@/components/public/home-horizontal-carousel";
import { MarketingFooter } from "@/components/public/marketing-footer";
import { getPublishedKits } from "@/lib/data/public-kits";
import { getPublicHomeBanners } from "@/lib/data/home-banners";
import { HomeHeroCarousel } from "@/components/public/home-hero-carousel";
import { getPublicHomeSections } from "@/lib/data/home-sections";
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

const HARMONY_COURSE_URL = "https://harmonia.focoemcanto.com";

const VOICE_SECTIONS = [
  { title: "Barítono", description: "Camada masculina de apoio com equilíbrio entre grave e brilho no médio." },
  { title: "Tenor", description: "Ataque definido no médio/agudo para trazer energia e presença nas entradas." },
  { title: "Contralto", description: "Camadas que preenchem o centro harmônico com textura e sustentação." },
  { title: "Soprano", description: "Linhas com brilho, extensão e firmeza para conduzir melodias com segurança." },
];

export default async function HomePage() {
  const [kits, homeBanners, homeSections] = await Promise.all([
    getPublishedKits(),
    getPublicHomeBanners(),
    getPublicHomeSections(),
  ]);

  const latestKits = kits.slice(0, 6);

  const categories = Array.from(
    new Map(
      kits
        .filter((kit) => kit.category)
        .map((kit) => [kit.category!.slug, kit.category!]),
    ).values(),
  );

  const featuredCategories = categories.slice(0, 3);

  const categoryKitCount = kits.reduce<Record<string, number>>((acc, kit) => {
    if (kit.category?.slug) {
      acc[kit.category.slug] = (acc[kit.category.slug] ?? 0) + 1;
    }
    return acc;
  }, {});

  return (
    <PublicAppShell>
      <main className="mx-auto w-full max-w-[1320px] space-y-10 px-4 pb-16 pt-6 md:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.35),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.28),transparent_35%),linear-gradient(145deg,#030712,#070d1f_45%,#09051a)] p-5 md:p-10">
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h1 className="mt-3 text-3xl font-semibold leading-tight text-white md:text-6xl">
                Prepare sua voz. Honre seu chamado.
              </h1>

              <p className="mt-4 max-w-2xl text-base text-zinc-200 md:text-lg">
                Kits vocais completos em todos os tons e vozes para preparar seu ministério com excelência, segurança e unidade vocal.
              </p>

              <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/todos-os-kits"
                  className="inline-flex w-fit min-w-[150px] items-center justify-center rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-6 py-3 text-center text-sm font-bold text-slate-950 shadow-[0_12px_40px_rgba(56,189,248,0.45)] transition hover:scale-[1.02]"
                >
                  Explorar kits
                </Link>

                <SubscribeButton
                  planSlug="premium"
                  label="Experimentar grátis por 7 dias"
                  className="inline-flex w-fit min-w-[280px] items-center justify-center rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-80"
                />
              </div>
            </div>

            <div className="relative min-w-0 overflow-hidden rounded-[2rem]">
              <HomeHeroCarousel
                banners={
                  homeBanners.length
                    ? homeBanners
                    : latestKits.slice(0, 1).map((kit, index) => ({
                        id: `fallback-${index}`,
                        title: kit.name,
                        subtitle: kit.artist,
                        button_label: "Ver kit",
                        button_href: `/biblioteca/${kit.slug}`,
                        image_url: kit.coverUrl ?? "",
                        mobile_image_url: null,
                      }))
                }
                latestKits={latestKits.map((kit) => ({
                  id: kit.id,
                  slug: kit.slug,
                  name: kit.name,
                  artist: kit.artist,
                  coverUrl: kit.coverUrl,
                }))}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold text-white md:text-3xl">
              Últimos lançamentos
            </h2>

            <Link
              href="/todos-os-kits"
              className="text-sm text-cyan-200 hover:text-cyan-100"
            >
              Ver todos
            </Link>
          </div>

          <HomeHorizontalCarousel>
            {latestKits.length ? (
              latestKits.map((kit) => (
                <Link
                  key={kit.id}
                  href={`/biblioteca/${kit.slug}`}
                  className="group min-w-[82%] snap-start overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 to-white/5 shadow-[0_18px_40px_rgba(8,145,178,0.18)] transition hover:border-cyan-200/80 sm:min-w-[320px] md:min-w-[260px]"
                >
                  <div className="relative overflow-hidden">
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-fuchsia-500/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                      Novo
                    </span>

                    {kit.coverUrl ? (
                      <img
                        src={kit.coverUrl}
                        alt={kit.name}
                        className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="aspect-square w-full bg-gradient-to-br from-zinc-900 to-[#141828]" />
                    )}
                  </div>

                  <div className="p-4">
                    <p className="truncate text-lg font-semibold text-white">
                      {kit.name}
                    </p>
                    <p className="truncate text-sm text-zinc-300">
                      {kit.artist}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 p-8 text-center text-zinc-300">
                Sem lançamentos publicados ainda.
              </div>
            )}
          </HomeHorizontalCarousel>
        </section>

        <MarketingFooter />
      </main>
    </PublicAppShell>
  );
}
