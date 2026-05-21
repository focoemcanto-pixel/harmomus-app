import { redirect } from "next/navigation";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export default async function PerfilPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect('/login');

  return <main className="min-h-screen bg-background p-6 text-white"><section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-surface/70 p-6"><h1 className="text-2xl font-semibold">Perfil</h1><p className="mt-3 text-zinc-300">TODO: conteúdo completo do perfil.</p><div className="mt-6 flex items-center gap-4"><div className="h-16 w-16 rounded-full border border-white/15 bg-black/30" /><div><p>{context.profile?.full_name ?? 'Sem nome'}</p><p className="text-sm text-zinc-400">{context.profile?.email ?? 'Sem e-mail'}</p></div></div><button className="mt-5 rounded-lg border border-gold-400/40 px-4 py-2 text-sm">Alterar foto</button></section></main>;
}
