"use client";

import { useEffect, useRef } from "react";

export function HomeHorizontalCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const timer = window.setInterval(() => {
      if (!el || el.matches(":hover")) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = el.scrollLeft + Math.max(220, el.clientWidth * 0.72);
      el.scrollTo({ left: next >= max - 8 ? 0 : next, behavior: "smooth" });
    }, 4200);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      ref={ref}
      className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}
