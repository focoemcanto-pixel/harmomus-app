import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MinistryRow = {
  id: string;
  name: string | null;
  plan_type: string | null;
  status: string | null;
  seat_limit: number | null;
  stripe_subscription_id: string | null;
  profiles?: { full_name?: string | null; email?: string | null } | null;
};

async function getMinistries(): Promise<{ data: MinistryRow[]; error: string | null }> {
  try {
    const supabase = createSupabaseAdminClient() as any;
    const { data, error } = await supabase
      .from("ministries")
      .select("*, profiles:profiles!ministries_owner_user_id_fkey(full_name,email)")
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar os planos ministeriais.";
    return { data: [], error: message };
  }
}

export default async function AdminPlanosMinisteriaisPage() {
  const { data, error } = await getMinistries();

  return (
    <main className="space-y-6 p-6 text-white">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#141827] to-[#070910] p-6 shadow-premium">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Harmomus Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Planos Ministeriais</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-300">Acompanhe igrejas/ministérios assinantes, limites de acesso, status e vínculo Stripe.</p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100">
          <p className="font-semibold">Não foi possível carregar os dados agora.</p>
          <p className="mt-1 text-amber-100/80">{error}</p>
          <p className="mt-3 text-amber-100/70">Verifique se as migrations ministeriais foram aplicadas e se a variável SUPABASE_SERVICE_ROLE_KEY está configurada no ambiente de produção.</p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-[0.18em] text-zinc-400">
              <tr>
                <th className="px-4 py-3">Ministério</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Uso</th>
                <th className="px-4 py-3">Stripe</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((ministry) => (
                <tr key={ministry.id} className="border-t border-white/10">
                  <td className="px-4 py-4 font-semibold text-white">{ministry.name ?? "Sem nome"}</td>
                  <td className="px-4 py-4 text-zinc-300">{ministry.profiles?.full_name ?? ministry.profiles?.email ?? "-"}</td>
                  <td className="px-4 py-4 text-zinc-300">{ministry.plan_type ?? "-"}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-200">{ministry.status ?? "-"}</span></td>
                  <td className="px-4 py-4 text-zinc-300">-/{ministry.seat_limit ?? "-"}</td>
                  <td className="px-4 py-4 font-mono text-xs text-zinc-400">{ministry.stripe_subscription_id ?? "-"}</td>
                  <td className="px-4 py-4"><Link href={`/admin/planos-ministeriais/${ministry.id}`} className="text-cyan-200 hover:text-cyan-100">Ver</Link></td>
                </tr>
              ))}
              {!data.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">Nenhum plano ministerial encontrado ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
