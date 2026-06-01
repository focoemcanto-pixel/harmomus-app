import Link from "next/link";
import { Mail, MessageCircle, Phone, Search, ShieldCheck, UserRoundCheck, Users } from "lucide-react";

import { getAudience } from "@/lib/communication/service";

function valueOf(param: string | string[] | undefined) {
  return Array.isArray(param) ? param[0] : param;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function SummaryCard({ title, value, caption, icon: Icon }: { title: string; value: number; caption: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-950/90 to-slate-900 p-5 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
        <Icon className="h-4 w-4 text-cyan-200" />
      </div>
      <p className="mt-3 text-3xl font-semibold text-white">{formatNumber(value)}</p>
      <p className="mt-1 text-xs text-slate-500">{caption}</p>
    </article>
  );
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "emerald" | "amber" | "rose" | "cyan" }) {
  const tones = {
    slate: "border-white/10 bg-white/[0.03] text-slate-300",
    emerald: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    rose: "border-rose-400/25 bg-rose-500/10 text-rose-100",
    cyan: "border-cyan-400/25 bg-cyan-500/10 text-cyan-100",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

function commercialTone(status: string): "slate" | "emerald" | "amber" | "rose" | "cyan" {
  const value = status.toLowerCase();
  if (value.includes("upgrade")) return "amber";
  if (value.includes("recuper")) return "rose";
  if (value.includes("engaj")) return "emerald";
  return "cyan";
}

export async function AudienceTable({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const search = valueOf(searchParams?.q) ?? "";
  const page = Number(valueOf(searchParams?.page) ?? "1");
  const plan = valueOf(searchParams?.plan) ?? "";
  const status = valueOf(searchParams?.status) ?? "";
  const { rows, count, limit, summary, warnings } = await getAudience({ search, page, plan, status });
  const totalPages = Math.max(1, Math.ceil(count / limit));

  return (
    <div className="space-y-5">
      {warnings.length ? <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">Dados parciais: {warnings.slice(0, 2).map((warning) => warning.source).join(", ")}.</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard title="Contatos" value={summary.total} caption="Total em profiles" icon={Users} />
        <SummaryCard title="WhatsApp opt-in" value={summary.whatsappOptIn} caption="Elegíveis para fila WA" icon={MessageCircle} />
        <SummaryCard title="E-mail opt-in" value={summary.emailOptIn} caption="Elegíveis para e-mail" icon={Mail} />
        <SummaryCard title="Com telefone" value={summary.withPhone} caption="Telefone cadastrado" icon={Phone} />
        <SummaryCard title="Com e-mail" value={summary.withEmail} caption="E-mail cadastrado" icon={Mail} />
        <SummaryCard title="Ativos 30d" value={summary.active30d} caption="Acesso/play recente" icon={UserRoundCheck} />
      </div>

      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">CRM de contatos</h3>
            <p className="text-sm text-slate-400">Busca, filtros comerciais e sinais de assinatura/engajamento sem expor dados técnicos soltos.</p>
          </div>
          <Link href="/admin/comunicacao/segmentos" className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20">Ver segmentos</Link>
        </div>

        <form className="mt-5 grid gap-3 md:grid-cols-[1.5fr_0.8fr_0.8fr_auto]" action="/admin/comunicacao/audience">
          <label className="relative text-sm text-slate-300">
            <Search className="pointer-events-none absolute left-3 top-9 h-4 w-4 text-slate-500" />
            Busca
            <input name="q" defaultValue={search} placeholder="Nome, e-mail, telefone ou status" className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900 py-2.5 pl-9 pr-3 text-white outline-none transition focus:border-cyan-400/40" />
          </label>
          <label className="text-sm text-slate-300">Plano
            <select name="plan" defaultValue={plan} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-cyan-400/40">
              <option value="">Todos</option><option value="free">Free</option><option value="plus">Plus</option><option value="premium">Premium</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">Status comercial
            <select name="status" defaultValue={status} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-cyan-400/40">
              <option value="">Todos</option><option value="upgrade">Lead upgrade</option><option value="recuper">Recuperação</option><option value="engaj">Engajado</option><option value="nutri">Nutrição</option>
            </select>
          </label>
          <button className="self-end rounded-2xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500">Filtrar</button>
        </form>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>{["Contato", "Canais", "Plano", "Status comercial", "Sinais", "Último acesso", "Origem", "Criado em"].map((h) => <th className="px-4 py-3" key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-white/5 text-slate-200" key={row.id}>
                  <td className="px-4 py-4"><p className="font-semibold text-white">{row.full_name ?? "Sem nome"}</p><p className="text-xs text-slate-500">{row.email ?? "sem e-mail"}</p><p className="text-xs text-slate-500">{row.phone ?? "sem telefone"}</p></td>
                  <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5"><Badge tone={row.whatsapp_opt_in ? "emerald" : "slate"}>WhatsApp {row.whatsapp_opt_in ? "opt-in" : "off"}</Badge><Badge tone={row.email_opt_in ? "emerald" : "slate"}>E-mail {row.email_opt_in ? "opt-in" : "off"}</Badge></div></td>
                  <td className="px-4 py-4"><Badge tone="cyan">{row.plano ?? "Free"}</Badge><p className="mt-1 text-xs text-slate-500">{row.status ?? "—"}</p></td>
                  <td className="px-4 py-4"><Badge tone={commercialTone(row.commercial_status)}>{row.commercial_status}</Badge></td>
                  <td className="px-4 py-4"><p>{formatNumber(row.recent_plays)} plays</p><p className="text-xs text-amber-200">{formatNumber(row.premium_blocks)} bloqueios premium</p></td>
                  <td className="px-4 py-4 text-slate-300">{formatDate(row.last_activity_at ?? row.last_seen_at)}</td>
                  <td className="px-4 py-4 text-slate-400">{row.origin ?? "—"}</td>
                  <td className="px-4 py-4 text-slate-400">{formatDate(row.created_at)}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">Nenhum contato encontrado com os filtros atuais.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <span>{formatNumber(count)} contatos encontrados · página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <Link aria-disabled={page <= 1} href={`/admin/comunicacao/audience?q=${encodeURIComponent(search)}&plan=${encodeURIComponent(plan)}&status=${encodeURIComponent(status)}&page=${Math.max(1, page - 1)}`} className="rounded-xl border border-white/10 px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-40">Anterior</Link>
            <Link aria-disabled={page >= totalPages} href={`/admin/comunicacao/audience?q=${encodeURIComponent(search)}&plan=${encodeURIComponent(plan)}&status=${encodeURIComponent(status)}&page=${Math.min(totalPages, page + 1)}`} className="rounded-xl border border-white/10 px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-40">Próxima</Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
        <div className="flex items-center gap-2 text-white"><ShieldCheck size={18} className="text-emerald-300" /><h3 className="font-semibold">Status comerciais</h3></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(summary.commercialStatus).map(([label, total]) => <Badge key={label} tone={commercialTone(label)}>{label}: {formatNumber(total)}</Badge>)}
        </div>
      </section>
    </div>
  );
}
