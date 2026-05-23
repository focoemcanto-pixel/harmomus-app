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
  const kitSlides = latestKits.slice(0, 5).map((kit) => ({
    id: kit.id,
    title: kit.name,
    subtitle: kit.artist,
    button_label: "Ver kit",
    button_href: `/biblioteca/${kit.slug}`,
    image_url: kit.coverUrl ?? "",
    mobile_image_url: null,
  })).filter((kit) => kit.image_url);

  const slides: { id: string; node: ReactNode }[] = [...bannerSlides, ...kitSlides].map((slide) => ({
    id: slide.id,
    node: (
      <div className="relative h-full w-full overflow-hidden bg-[#080b14]">
        <picture>
          {slide.mobile_image_url ? <source media="(max-width: 768px)" srcSet={slide.mobile_image_url} /> : null}
          <img
            src={slide.image_url}
            alt={slide.title}
            className="h-full w-full object-contain p-0 md:object-cover"
          />
        </picture>

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 z-20 p-5 text-white md:p-7">
          {slide.title ? <h3 className="line-clamp-2 text-2xl font-semibold md:text-3xl">{slide.title}</h3> : null}
          {slide.subtitle ? <p className="mt-2 line-clamp-1 max-w-xl text-sm text-zinc-200 md:text-base">{slide.subtitle}</p> : null}
          {slide.button_label && slide.button_href ? (
            <Link
              href={slide.button_href}
              className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-100"
            >
              {slide.button_label}
            </Link>
          ) : null}
        </div>
      </div>
    ),
  }));

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % slides.length), 5200);
    return () => clearInterval(timer);
  }, [slides.length, paused]);

  if (!slides.length) return null;

  return (
    <div
      className="relative h-[280px] w-full overflow-hidden rounded-3xl border border-white/20 bg-black/30 shadow-[0_25px_80px_rgba(59,130,246,0.18)] md:h-[460px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex h-full w-full flex-nowrap transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((slide) => (
          <div key={slide.id} className="h-full w-full flex-none shrink-0 basis-full overflow-hidden">
            {slide.node}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-4">
        <div className="pointer-events-auto flex gap-2">
          {slides.map((slide, dot) => (
            <button
              key={slide.id}
              aria-label={`Ir para banner ${dot + 1}`}
              onClick={() => setIndex(dot)}
              className={`h-2 w-2 rounded-full ${dot === index ? "bg-white" : "bg-white/40"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
