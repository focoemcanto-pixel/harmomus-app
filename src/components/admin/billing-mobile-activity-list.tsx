import { BadgeCheck, RefreshCw } from "lucide-react";

import { formatDateTimeBR } from "@/lib/format-date-time-br";

type BillingMobileActivityItem = {
  user: string;
  email: string;
  plan: string;
  gateway: string;
  status: string;
  createdAt: string | null;
  currentPeriodEnd: string | null;
};

function formatDateTime(value?: string | null) {
  return formatDateTimeBR(value).replace("-", "—");
}

function statusBadgeClass(status: string) {
  if (status === "Ativo" || status === "Pago") return "bg-emerald-500/20 text-emerald-300";
  if (status === "Teste") return "bg-cyan-500/20 text-cyan-200";
  if (status === "Atrasado" || status === "Falhou") return "bg-amber-500/20 text-amber-200";
  return "bg-rose-500/20 text-rose-300";
}

export function BillingMobileActivityList({ items }: { items: BillingMobileActivityItem[] }) {
  if (!items.length) {
    return <p className="p-6 text-center text-sm text-muted lg:hidden">Nenhuma assinatura não-owner encontrada.</p>;
  }

  return (
    <div className="grid gap-3 lg:hidden">
      {items.map((item, index) => (
        <article key={`${item.user}-${item.createdAt}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{item.user}</p>
              <p className="mt-1 truncate text-xs text-muted">{item.email}</p>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(item.status)}`}>
              {item.status === "Ativo" ? <BadgeCheck className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
              {item.status}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="uppercase tracking-[0.14em] text-muted">Plano</p>
              <p className="mt-1 truncate font-medium text-white">{item.plan}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="uppercase tracking-[0.14em] text-muted">Gateway</p>
              <p className="mt-1 truncate font-medium text-white">{item.gateway}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
            <p className="rounded-xl border border-white/10 bg-white/5 p-3">Criada<br /><span className="text-white">{formatDateTime(item.createdAt)}</span></p>
            <p className="rounded-xl border border-white/10 bg-white/5 p-3">Renova/expira<br /><span className="text-white">{formatDateTime(item.currentPeriodEnd)}</span></p>
          </div>
        </article>
      ))}
    </div>
  );
}
