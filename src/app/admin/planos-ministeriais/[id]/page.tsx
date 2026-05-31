import { notFound } from "next/navigation";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function AdminMinisterioDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient() as any;
  const [{ data: ministry }, { data: members }, { data: logs }] = await Promise.all([
    supabase.from("ministries").select("*").eq("id", id).maybeSingle(),
    supabase.from("ministry_members").select("*,profiles(full_name,email)").eq("ministry_id", id),
    supabase.from("ministry_activity_logs").select("*").eq("ministry_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!ministry) notFound();
  return <main className="space-y-6 p-6 text-white"><h1 className="text-2xl font-semibold">{ministry.name}</h1><p>{ministry.plan_type} • {ministry.status} • limite {ministry.seat_limit}</p><section><h2 className="font-medium">Membros</h2><ul>{(members??[]).map((m:any)=><li key={m.id}>{m.profiles?.full_name??m.profiles?.email} - {m.role} ({m.status})</li>)}</ul></section><section><h2 className="font-medium">Últimas atividades</h2><ul>{(logs??[]).map((l:any)=><li key={l.id}>{l.action} - {formatDateTimeBR(l.created_at)}</li>)}</ul></section></main>;
}
