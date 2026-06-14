"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type MinistryRouteTransitionProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

export function MinistryRouteTransition({ href, className, children }: MinistryRouteTransitionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);

  const isExternal = href.startsWith("http");
  const isHash = href.startsWith("#") || href.includes("#");
  const isCurrent = href === pathname;
  const canPrefetch = !isExternal && !isHash && !isCurrent;

  useEffect(() => {
    setClicked(false);
  }, [pathname]);

  useEffect(() => {
    if (!canPrefetch) return;
    const id = window.requestIdleCallback?.(() => router.prefetch(href)) ?? window.setTimeout(() => router.prefetch(href), 80);
    return () => {
      if (typeof id === "number") window.clearTimeout(id);
    };
  }, [canPrefetch, href, router]);

  function prefetch() {
    if (canPrefetch) router.prefetch(href);
  }

  function markIntent() {
    if (canPrefetch) {
      setClicked(true);
      router.prefetch(href);
    }
  }

  function navigate(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0 ||
      isHash ||
      isExternal ||
      isCurrent
    ) {
      return;
    }

    event.preventDefault();
    setClicked(true);
    startTransition(() => {
      router.push(href);
    });
  }

  const pending = clicked || isPending;

  return (
    <a
      href={href}
      onClick={navigate}
      onPointerDown={markIntent}
      onMouseEnter={prefetch}
      onTouchStart={prefetch}
      onFocus={prefetch}
      aria-busy={pending}
      className={className}
      data-pending={pending ? "true" : "false"}
      data-active={isCurrent ? "true" : "false"}
    >
      {children}
      {pending ? <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-200 align-middle" /> : null}
    </a>
  );
}
