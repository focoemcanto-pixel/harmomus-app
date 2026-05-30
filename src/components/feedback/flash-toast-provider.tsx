"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from "lucide-react";

import type { FlashToastType } from "@/lib/flash";

type FlashToastPayload = {
  type: FlashToastType;
  message: string;
  createdAt?: number;
};

const toastConfig: Record<FlashToastType, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  success: {
    label: "Sucesso",
    className: "border-emerald-400/35 bg-emerald-500/10 text-emerald-100",
    icon: CheckCircle2,
  },
  error: {
    label: "Erro",
    className: "border-red-400/35 bg-red-500/10 text-red-100",
    icon: AlertCircle,
  },
  warning: {
    label: "Atenção",
    className: "border-amber-400/35 bg-amber-500/10 text-amber-100",
    icon: AlertTriangle,
  },
  info: {
    label: "Informação",
    className: "border-cyan-400/35 bg-cyan-500/10 text-cyan-100",
    icon: Info,
  },
};

function readFlashToast(): FlashToastPayload | null {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith("harmomus_flash="));

  if (!cookie) return null;

  try {
    const rawValue = cookie.split("=").slice(1).join("=");
    const parsed = JSON.parse(decodeURIComponent(rawValue));
    if (!parsed?.type || !parsed?.message) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearFlashToast() {
  document.cookie = "harmomus_flash=; Max-Age=0; path=/; SameSite=Lax";
}

export function FlashToastProvider() {
  const [toast, setToast] = useState<FlashToastPayload | null>(null);

  useEffect(() => {
    const currentToast = readFlashToast();
    if (!currentToast) return;

    setToast(currentToast);
    clearFlashToast();

    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!toast) return null;

  const config = toastConfig[toast.type] ?? toastConfig.info;
  const Icon = config.icon;

  return (
    <div className="fixed right-4 top-4 z-[100] w-[calc(100vw-2rem)] max-w-md sm:right-6 sm:top-6">
      <div className={`overflow-hidden rounded-3xl border bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur ${config.className}`}>
        <div className="flex items-start gap-4 p-4 sm:p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-current/25 bg-white/5">
            <Icon size={21} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">{config.label}</p>
            <p className="mt-1 text-sm font-medium leading-6 text-white">{toast.message}</p>
          </div>

          <button
            type="button"
            onClick={() => setToast(null)}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Fechar notificação"
          >
            <X size={15} />
          </button>
        </div>

        <div className="h-1 w-full bg-white/10">
          <div className="h-full w-full bg-current/40" />
        </div>
      </div>
    </div>
  );
}
