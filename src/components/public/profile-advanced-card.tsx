import Link from "next/link";

export function ProfileAdvancedCard({ date }: { date?: string | null }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 text-sm text-zinc-100">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">Preferências avançadas</p>
      <h2 className="mt-2 text-xl font-black text-white">Gerenciar preferências</h2>
      <p className="mt-2 text-zinc-300">{date ? `Solicitação agendada para ${date}.` : "Acesse opções avançadas do seu perfil."}</p>
      <Link href="/perfil/preferencias" className="mt-4 inline-flex rounded-2xl border border-white/15 bg-white/10 px-5 py-3 font-black text-white transition hover:bg-white/15">
        Abrir opções
      </Link>
    </section>
  );
}
