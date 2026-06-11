"use client";

import { useEffect, useMemo, useState } from "react";

import { trackClientEvent } from "@/lib/analytics/client-events";

type OnboardingChecklistProps = {
  isGuest: boolean;
};

const STORAGE_KEY = "harmomus_onboarding_checklist";
const HIDDEN_KEY = "harmomus_onboarding_checklist_hidden";

const ITEMS = [
  { id: "install_app", label: "Instalar aplicativo" },
  { id: "listen_first_kit", label: "Ouvir primeiro kit" },
  { id: "create_first_playlist", label: "Criar primeira playlist" },
  { id: "favorite_kit", label: "Favoritar um kit" },
  { id: "meet_premium", label: "Conhecer o Premium" },
] as const;

type ItemId = (typeof ITEMS)[number]["id"];
type ChecklistState = Record<ItemId, boolean>;

function emptyState(): ChecklistState {
  return ITEMS.reduce((acc, item) => {
    acc[item.id] = false;
    return acc;
  }, {} as ChecklistState);
}

function readState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<Record<ItemId, boolean>>;
    return ITEMS.reduce((acc, item) => {
      acc[item.id] = parsed[item.id] === true;
      return acc;
    }, {} as ChecklistState);
  } catch {
    return emptyState();
  }
}

export function OnboardingChecklist({ isGuest }: OnboardingChecklistProps) {
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [state, setState] = useState<ChecklistState>(() => emptyState());

  useEffect(() => {
    if (isGuest) return;
    setState(readState());
    setHidden(window.localStorage.getItem(HIDDEN_KEY) === "true");
    setMounted(true);
  }, [isGuest]);

  const completed = useMemo(() => ITEMS.filter((item) => state[item.id]).length, [state]);

  if (isGuest || !mounted || hidden) return null;

  function toggleItem(id: ItemId) {
    setState((current) => {
      const next = { ...current, [id]: !current[id] };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      trackClientEvent("onboarding_checklist_item_toggled", { item: id, checked: next[id] });
      return next;
    });
  }

  function hideChecklist() {
    window.localStorage.setItem(HIDDEN_KEY, "true");
    setHidden(true);
  }

  return (
    <section className="border-b border-white/10 bg-black/20 px-4 py-4 text-white">
      <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_80px_rgba(34,211,238,0.08)] md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Primeiros passos</p>
            <h2 className="mt-1 text-lg font-black text-white">Checklist Harmomus</h2>
            <p className="mt-1 text-sm text-zinc-300">{completed}/{ITEMS.length} concluído</p>
          </div>
          <button
            type="button"
            onClick={hideChecklist}
            className="w-fit rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-white/10"
          >
            Esconder checklist
          </button>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-5">
          {ITEMS.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-100 transition hover:bg-white/[0.06]"
            >
              <input
                type="checkbox"
                checked={state[item.id]}
                onChange={() => toggleItem(item.id)}
                className="h-4 w-4 accent-cyan-300"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
