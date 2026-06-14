"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type MinistryRouteTransitionProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
  pendingText?: string;
};

export function MinistryRouteTransition({ href, className, children, pendingText = "Abrindo..." }: MinistryRouteTransitionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);
  const isExternal = href.startsWith("http");
  const isHash = href.startsWith("#") || href.includes("#");
  const isCurrent = href === pathname;
  const canPrefetch = !isExternal && !isHash && !isCurrent;

  useEffect(() => setClicked(false), [pathname]);
  useEffect(() => { if (!canPrefetch) return; const id = window.setTimeout(() => router.prefetch(href), 40); return () => window.clearTimeout(id); }, [canPrefetch, href, router]);

  function prefetch() { if (canPrefetch) router.prefetch(href); }
  function markIntent() { if (canPrefetch) { setClicked(true); router.prefetch(href); } }
  function navigate(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || isHash || isExternal || isCurrent) return;
    event.preventDefault();
    setClicked(true);
    startTransition(() => router.push(href));
  }

  const pending = clicked || isPending;
  return (
    <a href={href} onClick={navigate} onPointerDown={markIntent} onMouseEnter={prefetch} onTouchStart={prefetch} onFocus={prefetch} aria-busy={pending} className={className} data-pending={pending ? "true" : "false"} data-active={isCurrent ? "true" : "false"}>
      {pending ? <span className="inline-flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{pendingText}</span> : children}
    </a>
  );
}
