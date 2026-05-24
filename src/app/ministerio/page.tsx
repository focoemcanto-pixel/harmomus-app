import { redirect } from "next/navigation";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export default async function MinisterioPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");

  const supabase = (await createClient()) as any;
  const [{ data: ministry }, { data: members }] = await Promise.all([
    supabase.from("ministries").select("*").eq("id", context.ministry.ministryId).single(),
    supabase.from("ministry_members").select("id,user_id,role,status,profiles:profiles(full_name,email,avatar_url)").eq("ministry_id", context.ministry.ministryId).order("role"),
  ]);

  const usedSeats = (members ?? []).filter((m: any) => m.status === "active").length;

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#020617] via-[#060b1a] to-[#09031a] p-4 text-white md:p-8">
        <section className="mx-auto max-w-6xl space-y-6 rounded-[2rem] border border-fuchsia-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#0a0f1f] p-6 shadow-[0_30px_80px_rgba(91,33,182,0.35)] md:p-10">
          <h1 className="text-3xl font-semibold">{ministry?.name}</h1>
          <p className="text-zinc-300">{usedSeats}/{ministry?.seat_limit} membros • status {ministry?.status}</p>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left"><tr><th className="p-3">Nome</th><th>Email</th><th>Perfil</th><th>Status</th></tr></thead>
              <tbody>
                {(members ?? []).map((m: any) => <tr key={m.id} className="border-t border-white/10"><td className="p-3">{m.profiles?.full_name ?? "Sem nome"}</td><td>{m.profiles?.email}</td><td>{m.role}</td><td>{m.status}</td></tr>)}
              </tbody>
            </table>
          </div>

          {isMinistryManager(context) ? (
            <form action="/api/ministerio/invite" method="post" className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-3">
              <input name="email" type="email" required placeholder="Email do membro" className="rounded-lg border border-white/15 bg-white/5 px-3 py-2" />
              <select name="role" className="rounded-lg border border-white/15 bg-white/5 px-3 py-2"><option value="member">Membro</option><option value="manager">Manager</option></select>
              <button className="rounded-lg bg-cyan-300 px-3 py-2 font-semibold text-slate-900">Convidar</button>
            </form>
          ) : null}
        </section>
      </main>
    </PublicAppShell>
  );
}
