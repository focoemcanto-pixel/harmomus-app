"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type InstallAppBannerProps = {
  isGuest: boolean;
  profileCreatedAt?: string | null;
};

const DISMISSED_KEY = "harmomus_install_banner_dismissed";
const CLICKED_KEY = "harmomus_install_banner_clicked";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isWithinFirstSevenDays(profileCreatedAt?: string | null) {
  if (!profileCreatedAt) return true;
  const createdAt = new Date(profileCreatedAt).getTime();
  if (Number.isNaN(createdAt)) return true;
  return Date.now() - createdAt <= SEVEN_DAYS_MS;
}

export function InstallAppBanner({ isGuest, profileCreatedAt }: InstallAppBannerProps) {
  const [visible, setVisible] = useState(false);

  const shouldOfferInstall = useMemo(
    () => !isGuest && isWithinFirstSevenDays(profileCreatedAt),
    [isGuest, profileCreatedAt],
  );

  useEffect(() => {
    if (!shouldOfferInstall) {
      setVisible(false);
      return;
    }

    const dismissed = window.localStorage.getItem(DISMISSED_KEY) === "true";
    const clicked = window.localStorage.getItem(CLICKED_KEY) === "true";
    setVisible(!dismissed && !clicked);
  }, [shouldOfferInstall]);

  if (!visible) return null;

  return (
    <div className="border-b border-cyan-300/20 bg-gradient-to-r from-cyan-500/15 via-violet-500/10 to-fuchsia-500/10 px-4 py-3 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-cyan-100">📱 Instale o Harmomus como aplicativo</p>
          <p className="mt-1 text-xs leading-5 text-zinc-200 md:text-sm">
            Acesse seus kits e estudos mais rápido direto pela tela inicial do celular.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/instalar"
            onClick={() => {
              window.localStorage.setItem(CLICKED_KEY, "true");
              setVisible(false);
            }}
            className="inline-flex w-fit items-center justify-center rounded-xl bg-cyan-300 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-cyan-200 md:text-sm"
          >
            Ver tutorial
          </Link>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(DISMISSED_KEY, "true");
              setVisible(false);
            }}
            className="inline-flex w-fit items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 md:text-sm"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
