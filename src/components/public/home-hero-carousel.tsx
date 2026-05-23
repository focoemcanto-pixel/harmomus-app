"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { HomeBanner } from "@/lib/data/home-banners";

type BannerSlide = Pick<HomeBanner, "id" | "title" | "subtitle" | "button_label" | "button_href" | "image_url" | "mobile_image_url">;

type LatestKitSlide = {
  id: string;
  slug: string;
  name: string;
  artist: string;
  coverUrl: string | null;
};

export function HomeHeroCarousel({ banners, latestKits = [] }: { banners: BannerSlide[]; latestKits?: LatestKitSlide[] }) {
  const bannerSlides = banners.filter((b) => b.image_url);
  const hasLatestSlide = latestKits.length > 0;
  const totalSlides = bannerSlides.length + (hasLatestSlide ? 1 : 0) + 1;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (totalSlides <= 1 || paused) return;
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % totalSlides), 5200);
    return () => clearInterval(timer);
  }, [totalSlides, paused]);

  if (!totalSlides) return null;

  const slides: { id: string; node: ReactNode }[] = [
    ...bannerSlides.map((slide) => ({
      id: slide.id,
      node: (
        <div className="relative min-h-[340px]">
          <picture>
            {slide.mobile_image_url ? <source media="(max-width: 768px)" srcSet={slide.mobile_image_url} /> : null}
            <img src={slide.image_url} alt={slide.title} className="h-full min-h-[340px] w-full object-cover" />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 z-20 p-5 text-white md:p-7">
            {slide.title ? <h3 className="text-xl font-semibold md:text-3xl">{slide.title}</h3> : null}
            {slide.subtitle ? <p className="mt-2 max-w-xl text-sm text-zinc-200 md:text-base">{slide.subtitle}</p> : null}
            {slide.button_label && slide.button_href ? <Link href={slide.button_href} className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:scale-[1.02] hover:bg-cyan-100">{slide.button_label}</Link> : null}
          </div>
        </div>
      ),
    })),
    ...(hasLatestSlide ? [{
      id: "latest-kits-weekly",
      node: (
        <div className="relative min-h-[340px] overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.22),transparent_35%),linear-gradient(135deg,#07111f,#0b1020_50%,#160824)] p-5 text-white md:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">Novos kits toda semana</p>
          <h3 className="mt-3 max-w-lg text-3xl font-black leading-tight md:text-4xl">Últimos lançamentos para o seu repertório</h3>
          <p className="mt-2 max-w-md text-sm text-zinc-300">Passe pelos kits adicionados recentemente e prepare sua equipe com novidades constantes.</p>
          <div className="mt-6 flex gap-3 overflow-hidden">
            {latestKits.slice(0, 5).map((kit) => (
              <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="group min-w-[136px] overflow-hidden rounded-2xl border border-white/15 bg-white/10 transition hover:-translate-y-1 hover:border-cyan-200/70 md:min-w-[150px]">
                {kit.coverUrl ? <img src={kit.coverUrl} alt={kit.name} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="aspect-square w-full bg-white/10" />}
                <div className="p-3">
                  <p className="line-clamp-1 text-sm font-bold text-white">{kit.name}</p>
                  <p className="line-clamp-1 text-xs text-zinc-300">{kit.artist}</p>
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
        <div className="relative min-h-[340px] overflow-hidden bg-[radial-gradient(circle_at_85%_15%,rgba(250,204,21,0.26),transparent_32%),radial-gradient(circle_at_15%_80%,rgba(34,211,238,0.22),transparent_35%),linear-gradient(135deg,#100816,#111827_55%,#271006)] p-5 text-white md:p-7">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-yellow-200">Harmomus Premium</p>
            <h3 className="mt-3 text-3xl font-black leading-tight md:text-5xl">Desbloqueie todos os tons e recursos</h3>
            <p className="mt-3 text-sm text-zinc-200 md:text-base">Navegue sem limite diário, crie playlists, peça novos tons e acesse a experiência completa de estudo vocal.</p>
            <div className="mt-5 grid gap-2 text-sm text-zinc-100 sm:grid-cols-2">
              <span className="rounded-xl bg-white/10 px-3 py-2">✓ Todos os tons</span>
              <span className="rounded-xl bg-white/10 px-3 py-2">✓ Acesso ilimitado</span>
              <span className="rounded-xl bg-white/10 px-3 py-2">✓ Solicitar novo tom</span>
              <span className="rounded-xl bg-white/10 px-3 py-2">✓ Playlists premium</span>
            </div>
            <Link href="/assinar?plan=premium" className="mt-6 inline-flex rounded-xl bg-gradient-to-r from-yellow-200 to-cyan-200 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_18px_50px_rgba(250,204,21,0.25)] transition hover:scale-[1.02]">Tornar-se Premium</Link>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="relative min-h-[340px] overflow-hidden rounded-3xl border border-white/20 bg-black/30" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex h-full transition-transform duration-700 ease-out" style={{ width: `${slides.length * 100}%`, transform: `translateX(-${(100 / slides.length) * index}%)` }}>
        {slides.map((slide) => (
          <div key={slide.id} className="min-h-[340px]" style={{ width: `${100 / slides.length}%` }}>
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
