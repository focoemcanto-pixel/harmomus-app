"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { trackClientEvent } from "@/lib/analytics/client-events";

type OnboardingChecklistSlotProps = {
  isGuest: boolean;
};

type RectState = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type TourStep = {
  title: string;
  description: string;
  selector: string;
  fallback: "top" | "center" | "right";
};

const COMPLETED_KEY = "harmomus_guided_onboarding_completed";
const DISMISSED_KEY = "harmomus_guided_onboarding_dismissed";
const CURRENT_STEP_KEY = "harmomus_guided_onboarding_step";
const HIDDEN_PATHS = ["/instalar", "/login", "/cadastro", "/checkout/sucesso"];

const STEPS: TourStep[] = [
  {
    title: "Encontre o kit perfeito 🔎",
    description: "Use a busca para encontrar kits, artistas ou categorias sem perder tempo.",
    selector: 'input[placeholder*="Buscar"]',
    fallback: "top",
  },
  {
    title: "Abra um kit para estudar 🎧",
    description: "Clique em um kit da biblioteca para ouvir, treinar vozes e organizar seus estudos.",
    selector: 'a[href^="/biblioteca/"], a[href^="/todos-os-kits/"], [data-tour="kit-card"]',
    fallback: "center",
  },
  {
    title: "Veja todos os kits 🎵",
    description: "Quando quiser explorar o catálogo completo, comece por aqui.",
    selector: 'a[href="/todos-os-kits"]',
    fallback: "right",
  },
  {
    title: "Monte suas playlists ✨",
    description: "Use playlists para separar repertórios, ensaios e estudos por ministério ou ocasião.",
    selector: 'a[href="/minhas-playlists"], a[href*="playlist"], button[aria-label*="playlist" i]',
    fallback: "center",
  },
  {
    title: "Conheça os recursos Premium 👑",
    description: "Depois de experimentar os kits, explore o Premium para liberar a experiência completa.",
    selector: 'a[href="/area-premium"], a[href*="/assinar"], a[href="/assinatura"]',
    fallback: "right",
  },
];

function getFallbackRect(position: TourStep["fallback"]): RectState {
  const width = Math.min(520, window.innerWidth - 48);
  const height = 96;
  if (position === "top") {
    return { top: 72, left: (window.innerWidth - width) / 2, width, height };
  }
  if (position === "right") {
    return {
      top: 96,
      left: Math.max(24, window.innerWidth - width - 48),
      width,
      height,
    };
  }
  return {
    top: Math.max(120, window.innerHeight / 2 - 48),
    left: (window.innerWidth - width) / 2,
    width,
    height,
  };
}

function getTargetRect(step: TourStep): RectState {
  const target = document.querySelector(step.selector) as HTMLElement | null;
  if (!target) return getFallbackRect(step.fallback);

  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  const rect = target.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function OnboardingChecklistSlot({ isGuest }: OnboardingChecklistSlotProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<RectState | null>(null);

  const step = STEPS[stepIndex];
  const shouldHideForPath = useMemo(
    () => HIDDEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)),
    [pathname],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || isGuest || shouldHideForPath) {
      setVisible(false);
      return;
    }

    const completed = window.localStorage.getItem(COMPLETED_KEY) === "true";
    const dismissed = window.localStorage.getItem(DISMISSED_KEY) === "true";
    if (completed || dismissed) {
      setVisible(false);
      return;
    }

    const storedStep = Number(window.localStorage.getItem(CURRENT_STEP_KEY) ?? 0);
    const safeStep = Number.isFinite(storedStep) ? clamp(storedStep, 0, STEPS.length - 1) : 0;
    setStepIndex(safeStep);
    setVisible(true);
    trackClientEvent("guided_onboarding_started", { step: safeStep + 1 });
  }, [mounted, isGuest, shouldHideForPath]);

  useEffect(() => {
    if (!visible || !step) return;

    let frame = window.requestAnimationFrame(() => {
      setTargetRect(getTargetRect(step));
    });

    function updatePosition() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setTargetRect(getTargetRect(step)));
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [visible, step]);

  if (!mounted || !visible || !targetRect || !step) return null;

  const padding = 10;
  const spotlight = {
    top: Math.max(12, targetRect.top - padding),
    left: Math.max(12, targetRect.left - padding),
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
  };
  const popoverWidth = Math.min(360, window.innerWidth - 32);
  const popoverTop = clamp(spotlight.top + spotlight.height + 18, 88, window.innerHeight - 300);
  const popoverLeft = clamp(
    spotlight.left + spotlight.width / 2 - popoverWidth / 2,
    16,
    window.innerWidth - popoverWidth - 16,
  );
  const isLastStep = stepIndex === STEPS.length - 1;

  function finishTour(reason: "completed" | "dismissed") {
    if (reason === "completed") window.localStorage.setItem(COMPLETED_KEY, "true");
    if (reason === "dismissed") window.localStorage.setItem(DISMISSED_KEY, "true");
    window.localStorage.removeItem(CURRENT_STEP_KEY);
    trackClientEvent("guided_onboarding_finished", { reason, step: stepIndex + 1 });
    setVisible(false);
  }

  function nextStep() {
    if (isLastStep) {
      finishTour("completed");
      return;
    }
    const next = stepIndex + 1;
    window.localStorage.setItem(CURRENT_STEP_KEY, String(next));
    trackClientEvent("guided_onboarding_next_clicked", { from: stepIndex + 1, to: next + 1 });
    setStepIndex(next);
  }

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px]" />

      <div
        className="absolute rounded-2xl border-2 border-cyan-300/80 bg-white/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.55),0_0_38px_rgba(34,211,238,0.62)] transition-all duration-200"
        style={spotlight}
      />

      <div
        className="pointer-events-auto absolute rounded-[1.5rem] border border-white/15 bg-[#111827]/95 p-5 text-white shadow-[0_25px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-200"
        style={{ top: popoverTop, left: popoverLeft, width: popoverWidth }}
      >
        <div className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 border-l border-t border-white/15 bg-[#111827]" />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-black text-cyan-200">{stepIndex + 1} de {STEPS.length}</p>
            <button
              type="button"
              onClick={() => finishTour("dismissed")}
              className="rounded-full px-2 text-xl leading-none text-zinc-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Fechar tour"
            >
              ×
            </button>
          </div>

          <h2 className="mt-3 text-2xl font-black text-white">{step.title}</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-200">{step.description}</p>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => finishTour("dismissed")}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              Pular tour
            </button>
            <button
              type="button"
              onClick={nextStep}
              className="rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:brightness-110"
            >
              {isLastStep ? "Entendi" : "Próximo"}
            </button>
          </div>

          <div className="mt-5 flex justify-center gap-2">
            {STEPS.map((item, index) => (
              <span
                key={item.title}
                className={`h-2 rounded-full transition-all ${index === stepIndex ? "w-7 bg-violet-400" : "w-4 bg-white/20"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
