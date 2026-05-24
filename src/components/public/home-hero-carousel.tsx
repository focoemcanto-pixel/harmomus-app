"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { HomeBanner } from "@/lib/data/home-banners";

type BannerSlide = Pick<HomeBanner, "id" | "title" | "subtitle" | "button_label" | "button_href" | "image_url" | "mobile_image_url">;
type BannerSlideWithImage = BannerSlide & { image_url: string };

type LatestKitSlide = {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  coverUrl: string | null;
};

function hasBannerImage(banner: BannerSlide): banner is BannerSlideWithImage {
  return Boolean(banner.image_url && banner.image_url.trim());
}

export function HomeHeroCarousel({ banners, latestKits = [] }: { banners: BannerSlide[]; latestKits?: LatestKitSlide[] }) {
  const bannerSlides = banners.filter(hasBannerImage);
  const hasLatestSlide = latestKits.length > 0;
  const totalSlides = bannerSlides.length + (hasLatestSlide ? 1 : 0) + 1;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (totalSlides <= 1 || paused) return;
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % totalSlides), 5200);
    return () => clearInterval(timer);
  }, [totalSlides, paused]);

  const slides: { id: string; node: ReactNode }[] = [
    ...bannerSlides.map((slide, slideIndex) => ({
      id: slide.id,
      node: (
        <div className="relative h-full w-full overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src={slide.image_url}
              alt={slide.title || "Banner Harmomus"}
              fill
              priority={slideIndex === 0}
              sizes="100vw"
              className="object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 z-20 p-5 text-white md:p-6">
            {slide.title ? <h3 className="line-clamp-2 text-xl font-semibold md:text-2xl">{slide.title}</h3> : null}
            {slide.subtitle ? <p className="mt-2 line-clamp-2 max-w-xl text-sm text-zinc-200">{slide.subtitle}</p> : null}
            {slide.button_label && slide.button_href ? <Link href={slide.button_href} prefetch className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-100">{slide.button_label}</Link> : null}
          </div>
        </div>
      ),
    })),
    ...(hasLatestSlide ? [{
      id: "latest-kits-weekly",
      node: (
        <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.22),transparent_35%),linear-gradient(135deg,#07111f,#0b1020_50%,#160824)] p-5 text-white md:p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">Novos kits toda semana</p>
          <h3 className="mt-2 max-w-lg text-2xl font-black leading-tight md:text-3xl">Últimos lançamentos para o seu repertório</h3>
          <p className="mt-2 line-clamp-2 max-w-md text-sm text-zinc-300">Passe pelos kits adicionados recentemente e prepare sua equipe com novidades constantes.</p>
          <div className="mt-5 grid grid-cols-5 gap-2">
            {latestKits.slice(0, 5).map((kit) => (
              <Link key={kit.id} href={`/biblioteca/${kit.slug}`} prefetch className="group min-w-0 overflow-hidden rounded-xl border border-white/15 bg-white/10 transition hover:-translate-y-1 hover:border-cyan-200/70">
                {kit.coverUrl ? (
                  <div className="relative aspect-square w-full overflow-hidden">
                    <Image
                      src={kit.coverUrl}
                      alt={kit.name}
                      fill
                      sizes="160px"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                ) : <div className="aspect-square w-full bg-white/10" />}
                <div className="p-2">
                  <p className="line-clamp-1 text-xs font-bold text-white">{kit.name}</p>
                  <p className="line-clamp-1 text-[10px] text-zinc-300">{kit.artist ?? "Kit vocal"}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ),
    }] : []),
    {
      id: "premium-upgrade",
      node: (
        <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_85%_15%,rgba(250,204,21,0.22),transparent_32%),radial-gradient(circle_at_15%_80%,rgba(34,211,238,0.18),transparent_35%),linear-gradient(135deg,#100816,#111827_55%,#271006)] p-5 text-white md:p-6">
          <div className="max-w-lg">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-200 md:text-xs md:tracking-[0.22em]">Harmomus Premium</p>
            <h3 className="mt-2 text-[26px] font-black leading-[1.1] md:text-3xl">Desbloqueie todos os tons e recursos</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-200">Navegue sem limite diário, crie playlists, peça novos tons e acesse a experiência completa.</p>
            <div className="mt-4 grid gap-2 text-xs text-zinc-100 sm:grid-cols-2">
              <span className="rounded-xl bg-white/10 px-3 py-2">✓ Todos os tons</span>
              <span className="rounded-xl bg-white/10 px-3 py-2">✓ Acesso ilimitado</span>
              <span className="rounded-xl bg-white/10 px-3 py-2">✓ Solicitar novo tom</span>
              <span className="hidden rounded-xl bg-white/10 px-3 py-2 sm:block">✓ Playlists premium</span>
            </div>
            <Link href="/assinar?plan=premium" prefetch className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-yellow-200 to-cyan-200 px-4 py-2.5 text-xs font-black text-slate-950 shadow-[0_18px_50px_rgba(250,204,21,0.25)] transition hover:scale-[1.02] md:mt-5 md:px-5 md:py-3 md:text-sm">Tornar-se Premium</Link>
          </div>
        </div>
      ),
    },
  ];

  if (!slides.length) return null;

  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-3xl border border-white/20 bg-black/30 md:h-[340px]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex h-full w-full flex-nowrap transition-transform duration-700 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((slide) => (
          <div key={slide.id} className="h-full w-full flex-none shrink-0 basis-full overflow-hidden">
            {slide.node}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-4">
        <div className="pointer-events-auto flex gap-2">{slides.map((slide, dot) => <button key={slide.id} aria-label={`Ir para banner ${dot + 1}`} onClick={() => setIndex(dot)} className={`h-2 w-2 rounded-full ${dot === index ? "bg-white" : "bg-white/40"}`} />)}</div>
      </div>
    </div>
  );
}
