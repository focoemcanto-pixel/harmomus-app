interface PageHeaderProps {
  title: string;
  description: string;
  actionLabel?: string;
}

export function PageHeader({ title, description, actionLabel }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>

      {actionLabel ? (
        <button className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
