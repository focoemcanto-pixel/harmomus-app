type SubscriptionMobileItem = {
  id: string;
  user: string;
  email: string;
  plan: string;
  status: string;
  gateway: string;
  renewsAt: string;
  updatedAt: string;
};

function statusClass(status: string) {
  if (status === "Ativo") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
  if (status === "Teste") return "border-cyan-400/25 bg-cyan-500/10 text-cyan-100";
  if (status === "Pendente" || status === "Atrasado") return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  return "border-rose-400/25 bg-rose-500/10 text-rose-100";
}

export function SubscriptionsMobileCardList({ items }: { items: SubscriptionMobileItem[] }) {
  if (!items.length) {
    return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500 lg:hidden">Nenhuma assinatura encontrada.</div>;
  }

  return (
    <div className="grid gap-3 lg:hidden">
      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{item.user}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{item.email}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${statusClass(item.status)}`}>{item.status}</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="uppercase tracking-[0.14em] text-zinc-500">Plano</p>
              <p className="mt-1 truncate font-medium text-white">{item.plan}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="uppercase tracking-[0.14em] text-zinc-500">Gateway</p>
              <p className="mt-1 truncate font-medium text-white">{item.gateway}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3">Renova/expira<br /><span className="text-white">{item.renewsAt}</span></p>
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3">Atualizado<br /><span className="text-white">{item.updatedAt}</span></p>
          </div>
        </article>
      ))}
    </div>
  );
}
