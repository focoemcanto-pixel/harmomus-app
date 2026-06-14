"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";

export function MinistryToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const message = searchParams.get("message") || searchParams.get("error") || "";
  const isError = Boolean(searchParams.get("error"));
  const [visible, setVisible] = useState(false);
  const key = useMemo(() => `${pathname}:${message}:${isError ? "error" : "ok"}`, [pathname, message, isError]);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("message");
    params.delete("error");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    const cleanTimer = window.setTimeout(() => router.replace(nextUrl, { scroll: false }), 150);
    const hideTimer = window.setTimeout(() => setVisible(false), 3600);
    return () => {
      window.clearTimeout(cleanTimer);
      window.clearTimeout(hideTimer);
    };
  }, [key, message, pathname, router, searchParams]);

  if (!message || !visible) return null;

  return (
    <div className="fixed right-4 top-4 z-[9999] w-[calc(100vw-2rem)] max-w-md animate-in slide-in-from-top-2 duration-200 md:right-6 md:top-6">
      <div className={`flex items-start gap-3 rounded-2xl border p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl ${isError ? "border-amber-300/25 bg-amber-950/90 text-amber-50" : "border-cyan-300/25 bg-slate-950/90 text-cyan-50"}`}>
        <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${isError ? "text-amber-200" : "text-cyan-200"}`} />
        <p className="flex-1 text-sm font-semibold leading-5">{message}</p>
        <button type="button" onClick={() => setVisible(false)} className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Fechar aviso">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
