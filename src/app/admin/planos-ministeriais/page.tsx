import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function AdminPlanosMinisteriaisPage() {
  const supabase = createSupabaseAdminClient() as any;
  const { data } = await supabase.from("ministries").select("*, profiles:profiles!ministries_owner_user_id_fkey(full_name,email)").order("created_at", { ascending: false });

  return <main className="space-y-4 p-6 text-white"><h1 className="text-2xl font-semibold">Planos Ministeriais</h1><div className="overflow-auto rounded-xl border border-white/10"><table className="min-w-full text-sm"><thead><tr><th>Ministério</th><th>Owner</th><th>Plano</th><th>Status</th><th>Uso</th><th>Stripe</th><th></th></tr></thead><tbody>{(data??[]).map((m:any)=><tr key={m.id} className="border-t border-white/10"><td>{m.name}</td><td>{m.profiles?.full_name??m.profiles?.email}</td><td>{m.plan_type}</td><td>{m.status}</td><td>-/{m.seat_limit}</td><td className="font-mono text-xs">{m.stripe_subscription_id??"-"}</td><td><Link href={`/admin/planos-ministeriais/${m.id}`}>Ver</Link></td></tr>)}</tbody></table></div></main>;
}
