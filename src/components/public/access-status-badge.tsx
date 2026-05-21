export function AccessStatusBadge({ planSlug }: { planSlug: string }) {
  return <span className="inline-flex rounded-full border border-white/20 px-3 py-1 text-xs text-zinc-200">Plano atual: {planSlug}</span>;
}
