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

  useEffect(() => {
    setClicked(false);
  }, [pathname]);

  function navigate(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0 ||
      href.startsWith("#") ||
      href.startsWith("http")
    ) {
      return;
    }

    event.preventDefault();
    setClicked(true);
    startTransition(() => {
      router.prefetch(href);
      router.push(href);
    });
  }

  return (
    <a href={href} onClick={navigate} className={className} data-pending={clicked || isPending ? "true" : "false"}>
      {children}
      {(clicked || isPending) ? <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-200 align-middle" /> : null}
    </a>
  );
}
