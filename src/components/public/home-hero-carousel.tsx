"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { HomeBanner } from "@/lib/data/home-banners";

type BannerSlide = Pick<HomeBanner, "id" | "title" | "subtitle" | "button_label" | "button_href" | "image_url" | "mobile_image_url">;

export function HomeHeroCarousel({ banners }: { banners: BannerSlide[] }) {
  const slides = useMemo(() => banners.filter((b) => b.image_url), [banners]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [slides.length, paused]);

  if (!slides.length) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-black/30" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {slides.map((slide, slideIndex) => (
        <div key={slide.id} className={`absolute inset-0 transition-opacity duration-700 ${slideIndex === index ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <picture>
            {slide.mobile_image_url ? <source media="(max-width: 768px)" srcSet={slide.mobile_image_url} /> : null}
            <img src={slide.image_url} alt={slide.title} className="h-full min-h-[340px] w-full object-cover" />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 text-white md:p-7">
            {slide.title ? <h3 className="text-xl font-semibold md:text-3xl">{slide.title}</h3> : null}
            {slide.subtitle ? <p className="mt-2 max-w-xl text-sm text-zinc-200 md:text-base">{slide.subtitle}</p> : null}
            {slide.button_label && slide.button_href ? <Link href={slide.button_href} className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900">{slide.button_label}</Link> : null}
          </div>
        </div>
      ))}
      <div className="relative z-10 flex min-h-[340px] items-end justify-center p-4">
        <div className="flex gap-2">{slides.map((slide, dot) => <button key={slide.id} onClick={() => setIndex(dot)} className={`h-2 w-2 rounded-full ${dot === index ? "bg-white" : "bg-white/40"}`} />)}</div>
      </div>
    </div>
  );
}
