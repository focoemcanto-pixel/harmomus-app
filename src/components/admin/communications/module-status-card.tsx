import Link from "next/link";
import { CheckCircle2, Clock3, Wrench } from "lucide-react";

type ModuleStatus = "ready" | "planned" | "in_progress";

interface ModuleStatusCardProps {
  title: string;
  description: string;
  status?: ModuleStatus;
  items: string[];
  primaryActionHref?: string;
  primaryActionLabel?: string;
}

const statusConfig: Record<ModuleStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ready: {
    label: "Operacional",
    className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    icon: CheckCircle2,
  },
  in_progress: {
    label: "Em estruturação",
    className: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200",
    icon: Wrench,
  },
  planned: {
    label: "Planejado",
    className: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    icon: Clock3,
  },
};

export function ModuleStatusCard({ title, description, status = "planned", items, primaryActionHref, primaryActionLabel }: ModuleStatusCardProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-premium sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${config.className}`}>
            <Icon size={14} />
            {config.label}
          </span>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
        </div>
        {primaryActionHref && primaryActionLabel ? (
          <Link href={primaryActionHref} className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20">
            {primaryActionLabel}
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
