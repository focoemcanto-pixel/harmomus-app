interface DashboardCardProps {
  label: string;
  value: string;
  helper: string;
}

export function DashboardCard({ label, value, helper }: DashboardCardProps) {
  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-premium">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-xs text-gold-300">{helper}</p>
    </article>
  );
}
