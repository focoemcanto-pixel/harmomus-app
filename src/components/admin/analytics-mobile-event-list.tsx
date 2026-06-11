import Link from "next/link";

import { formatDateTimeBR } from "@/lib/format-date-time-br";

type AnalyticsMobileEvent = {
  when?: string | null;
  kit?: string | null;
  track?: string | null;
  user?: string | null;
  plan?: string | null;
  device?: string | null;
  toneVoice?: string | null;
  reason?: string | null;
  page?: string | null;
  kitSlug?: string | null;
};

export function AnalyticsMobileEventList({ items, emptyLabel, denied = false }: { items: AnalyticsMobileEvent[]; emptyLabel: string; denied?: boolean }) {
  if (!items.length) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400 lg:hidden">{emptyLabel}</div>;
  }

  return (
    <div className="grid gap-3 lg:hidden">
      {items.map((item, index) => (
        <article key={`${item.when ?? "event"}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{item.kit || "Kit não informado"}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{item.track || "Faixa não informada"}</p>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-300">{item.plan || "—"}</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="uppercase tracking-[0.14em] text-zinc-500">Quando</p>
              <p className="mt-1 text-white">{item.when ? formatDateTimeBR(item.when) : "—"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="uppercase tracking-[0.14em] text-zinc-500">Dispositivo</p>
              <p className="mt-1 truncate text-white">{item.device || "—"}</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-400">
            <p className="truncate">Usuário: <span className="text-zinc-200">{item.user || "—"}</span></p>
            <p className="mt-1 truncate">Tom/Voz: <span className="text-zinc-200">{item.toneVoice || "—"}</span></p>
            {denied ? <p className="mt-1 truncate text-rose-200">Motivo: {item.reason || "—"}</p> : null}
          </div>

          {item.kitSlug ? (
            <Link href={`/biblioteca/${item.kitSlug}`} className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/20">
              Abrir página
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}
