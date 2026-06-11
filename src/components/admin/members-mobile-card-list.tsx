import Link from "next/link";
import { AlertTriangle, BadgeCheck } from "lucide-react";

import { formatDateTimeBR } from "@/lib/format-date-time-br";

type MobileMemberItem = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string | null;
  planName: string | null;
  status: string | null;
  gateway: string | null;
  nextBillingAt: string | null;
  journeyLabel: string;
  journeyDescription: string;
  journeyStage: "lead" | "checkout" | "pending" | "active" | "at_risk" | "lost";
  journeyHealth: "success" | "warning" | "danger" | "neutral";
  nextAction: string;
  actionHref: string;
  stripeLinked: boolean;
};

function safeDate(value?: string | null) {
  return value ? formatDateTimeBR(value) : "—";
}

function healthClass(health: MobileMemberItem["journeyHealth"]) {
  if (health === "success") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (health === "warning") return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  if (health === "danger") return "border-red-400/30 bg-red-500/10 text-red-200";
  return "border-white/10 bg-white/5 text-zinc-300";
}

function stagePillClass(stage: MobileMemberItem["journeyStage"]) {
  if (stage === "active") return "bg-emerald-500/15 text-emerald-200 border-emerald-400/30";
  if (stage === "pending" || stage === "checkout") return "bg-amber-500/15 text-amber-200 border-amber-400/30";
  if (stage === "lost" || stage === "at_risk") return "bg-red-500/15 text-red-200 border-red-400/30";
  return "bg-cyan-500/10 text-cyan-200 border-cyan-400/30";
}

export function MembersMobileCardList({ items }: { items: MobileMemberItem[] }) {
  if (!items.length) {
    return <p className="p-5 text-center text-sm text-muted lg:hidden">Nenhum membro encontrado para os filtros atuais.</p>;
  }

  return (
    <div className="grid gap-2 p-3 lg:hidden">
      {items.map((item) => (
        <article key={item.id} className="rounded-3xl border border-border bg-background/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">{item.name ?? "Sem nome"}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{item.email ?? "Sem e-mail"}</p>
              <p className="mt-1 text-[10px] text-zinc-500">Criado: {safeDate(item.createdAt)}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium ${stagePillClass(item.journeyStage)}`}>{item.journeyLabel}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-200">
              <span className="truncate">{item.planName ?? "Sem plano"}</span>
              <span className="ml-1 text-zinc-500">• {item.status ?? "none"}</span>
            </span>
            <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-300">
              <span className="truncate">{item.gateway ?? "Gateway —"}</span>
            </span>
            <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-400">
              <span className="truncate">Cob. {safeDate(item.nextBillingAt)}</span>
            </span>
          </div>

          <div className={`mt-2 rounded-2xl border px-2.5 py-2 ${healthClass(item.journeyHealth)}`}>
            <div className="flex items-center gap-2">
              {item.journeyHealth === "success" ? <BadgeCheck className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{item.nextAction}</p>
                <p className="mt-0.5 truncate text-[10px] opacity-70">Stripe: {item.stripeLinked ? "vinculado" : "sem vínculo visível"}</p>
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link href={`/admin/membros/${item.id}`} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-gold-400/40 hover:text-gold-200">
              Diagnóstico
            </Link>
            <Link href={item.actionHref} className="inline-flex items-center justify-center rounded-xl border border-gold-400/30 bg-gold-500/10 px-3 py-2 text-xs font-medium text-gold-200 transition hover:bg-gold-500/20">
              Intervir
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
