import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { getMembers } from "@/lib/data/members";
import { getPlans } from "@/lib/data/plans";

export default async function AdminMembrosPage({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string; status?: string }> }) {
  const params = await searchParams;
  const [members, plans] = await Promise.all([getMembers({ query: params.q, planId: params.plan, status: params.status }), getPlans()]);

  return (
    <section className="space-y-6">
      <PageHeader title="Central de Membros" description="Controle de perfis, assinaturas e status da base premium." />
      <form className="rounded-xl border border-border bg-surface p-4 shadow-premium grid gap-3 md:grid-cols-4">
        <input name="q" placeholder="Buscar por nome/email" defaultValue={params.q} className="rounded-lg border border-border bg-background px-3 py-2" />
        <select name="plan" defaultValue={params.plan ?? ""} className="rounded-lg border border-border bg-background px-3 py-2"><option value="">Todos os planos</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="status" defaultValue={params.status ?? ""} className="rounded-lg border border-border bg-background px-3 py-2"><option value="">Todos status</option>{["active","canceled","expired","pending","abandoned"].map((s)=><option key={s}>{s}</option>)}</select>
        <button className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-gold-300">Filtrar</button>
      </form>
      <div className="rounded-xl border border-border bg-surface shadow-premium overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm"><thead className="text-left text-muted"><tr><th className="p-4">Membro</th><th>Plano</th><th>Status</th><th>Renovação</th><th>Gateway</th><th></th></tr></thead>
          <tbody>{members.map((m)=><tr key={m.profile.id} className="border-t border-border/70"><td className="p-4"><p className="font-medium">{m.profile.full_name ?? "Sem nome"}</p><p className="text-xs text-muted">{m.profile.email ?? "Sem e-mail"}</p></td><td>{m.plan?.name ?? "Sem plano"}</td><td><span className="rounded-full bg-surface-muted px-3 py-1 text-xs">{m.subscription?.status ?? "none"}</span></td><td>{m.subscription?.current_period_end ? new Date(m.subscription.current_period_end).toLocaleDateString("pt-BR") : "-"}</td><td>{m.subscription?.gateway ?? "-"}</td><td><Link href={`/admin/membros/${m.profile.id}`} className="text-gold-300">Detalhes</Link></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
