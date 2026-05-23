import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, Headphones, MessageCircle, Music2, Send, Sparkles, Star, Trophy, Wand2 } from "lucide-react";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getGlobalTopKits, getRecommendedKits, getUserRecentActivities, getUserTopKits, type TopKit } from "@/lib/data/premium-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstName(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "Assinante";
  return source.split(" ")[0] || "Assinante";
}

function formatDate(value?: string | null) {
  if (!value) return "Hoje";
  try {
    return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "Hoje";
  }
}

export default async function AreaPremiumPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (context.effectiveSlug !== "premium") redirect("/assinatura");

  const userId = context.profile?.id ?? "";
  const [topYou, topSite, recommendedKits, activities] = await Promise.all([
    userId ? getUserTopKits(userId, 5).catch(() => []) : Promise.resolve([]),
    getGlobalTopKits(5).catch(() => []),
    userId ? getRecommendedKits(userId, 6).catch(() => []) : Promise.resolve([]),
    userId ? getUserRecentActivities(userId, 10).catch(() => []) : Promise.resolve([]),
  ]);

  const name = firstName(context.profile?.full_name, context.profile?.email);
  const avatar = context.profile?.avatar_url ?? null;
  const joinedAt = formatDate(context.profile?.created_at);
  const totalUserPlays = topYou.reduce((sum, kit) => sum + kit.plays, 0);

  return (
    <PublicAppShell>
      <main className="min-h-screen overflow-hidden bg-[#06080d] text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(34,197,94,0.18),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.2),transparent_35%),radial-gradient(circle_at_45%_80%,rgba(56,189,248,0.12),transparent_35%)]" />
        <section className="relative mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
          <div className="overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-gradient-to-br from-emerald-950/50 via-zinc-950/90 to-violet-950/45 shadow-[0_0_120px_rgba(34,197,94,0.16)]">
            <div className="grid gap-8 p-6 md:grid-cols-[0.8fr_1.2fr] md:p-10 lg:p-12">
              <div className="flex items-center gap-5 md:block">
                <div className="relative h-28 w-28 shrink-0 md:h-40 md:w-40">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-300 blur-xl opacity-40" />
                  <div className="relative h-full w-full overflow-hidden rounded-full border-4 border-emerald-400 bg-zinc-900">
                    {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-5xl font-bold">{name.slice(0, 1).toUpperCase()}</div>}
                  </div>
                </div>
                <div className="md:mt-7">
                  <p className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-black"><Star size={16} fill="currentColor" /> Premium subscriber</p>
                  <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight text-white md:text-6xl">Bem-vindo à sua Área Premium</h1>
                  <p className="mt-4 text-xl text-zinc-300">{name}, este é seu centro exclusivo de estudo vocal.</p>
                </div>
              </div>

              <div className="grid content-center gap-4 sm:grid-cols-2">
                {[
                  [String(totalUserPlays), "Reproduções", Headphones],
                  [activities.length ? "1" : "0", "Dias seguidos", Sparkles],
                  ["0", "Favoritos", Star],
                  [joinedAt, "Membro desde", Crown],
                ].map(([value, label, Icon]) => (
                  <div key={String(label)} className="rounded-3xl border border-emerald-400/25 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <Icon className="mb-4 text-emerald-300" />
                    <p className="text-4xl font-black text-emerald-300">{String(value)}</p>
                    <p className="mt-2 text-sm uppercase tracking-[0.18em] text-zinc-400">{String(label)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
            <PremiumPanel title="Top 5 (você)" icon={<Music2 className="text-emerald-300" />}>
              <Ranking items={topYou} empty="Você ainda não tem reproduções suficientes para formar seu Top 5." />
            </PremiumPanel>
            <PremiumPanel title="Top 5 (site)" icon={<Trophy className="text-cyan-300" />}>
              <Ranking items={topSite} empty="Ainda não existem reproduções registradas no site." />
            </PremiumPanel>
          </div>

          <PremiumPanel title="Kits recomendados" icon={<Star className="text-yellow-300" />} className="mt-8">
            {recommendedKits.length ? <div className="grid gap-4 md:grid-cols-3">
              {recommendedKits.map((kit) => (
                <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="group overflow-hidden rounded-3xl border border-emerald-400/20 bg-white/[0.04] transition hover:-translate-y-1 hover:border-emerald-300/60">
                  <div className="aspect-video overflow-hidden bg-zinc-900">
                    {kit.cover_url ? <img src={kit.cover_url} alt={kit.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-zinc-500">Harmomus</div>}
                  </div>
                  <div className="p-4">
                    <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">Recomendado</span>
                    <h3 className="mt-3 text-lg font-bold text-white">{kit.name}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{kit.artist ?? "Kit vocal premium"}</p>
                  </div>
                </Link>
              ))}
            </div> : <EmptyState text="As recomendações aparecerão depois que houver histórico real de reprodução no app." />}
          </PremiumPanel>

          <div className="mt-8 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <PremiumPanel title="Atividade recente" icon={<Headphones className="text-emerald-300" />}>
              {activities.length ? <div className="space-y-3">
                {activities.map((item) => (
                  <Link key={item.id} href={item.kit_slug ? `/biblioteca/${item.kit_slug}` : "#"} className="flex items-center gap-4 rounded-2xl bg-white/[0.05] p-4 transition hover:bg-white/[0.08]">
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/20 text-emerald-200"><Headphones size={20} /></div>
                    <div>
                      <p className="font-bold text-white">{item.label}</p>
                      <p className="text-sm text-zinc-400">{formatDate(item.created_at)}</p>
                    </div>
                  </Link>
                ))}
              </div> : <EmptyState text="Sua atividade recente aparecerá aqui quando você começar a ouvir os kits." />}
            </PremiumPanel>

            <div className="space-y-6">
              <PremiumForm title="Solicitar nova música" icon={<Music2 />} button="Enviar solicitação" fields={["Nome da música *", "Artista original *", "Link de referência", "Observações"]} />
              <PremiumForm title="Solicitar tom" icon={<Wand2 />} button="Enviar pedido de tom" fields={["Música *", "Tom desejado *", "Voz/nipe", "Observações"]} />
              <PremiumForm title="Enviar feedback" icon={<MessageCircle />} button="Enviar feedback" fields={["Tipo *", "Mensagem *", "Email opcional"]} />
            </div>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}

function PremiumPanel({ title, icon, children, className = "" }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[2rem] border border-emerald-400/20 bg-[#161918]/90 p-6 shadow-[0_0_60px_rgba(34,197,94,0.08)] ${className}`}><h2 className="mb-6 flex items-center gap-3 text-3xl font-black text-white md:text-4xl">{icon}{title}</h2>{children}</section>;
}

function Ranking({ items, empty }: { items: TopKit[]; empty: string }) {
  if (!items.length) return <EmptyState text={empty} />;
  return <div className="space-y-2">{items.map((item, index) => <Link href={`/biblioteca/${item.slug}`} key={item.id} className="flex items-center gap-4 border-b border-white/10 py-4 transition hover:bg-white/[0.03] last:border-b-0"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-300 text-lg font-black text-black">{index + 1}</div><p className="flex-1 text-lg font-bold text-white">{item.name}</p><p className="font-black text-emerald-400">{item.plays} plays</p></Link>)}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-sm text-zinc-300">{text}</div>;
}

function PremiumForm({ title, icon, fields, button }: { title: string; icon: React.ReactNode; fields: string[]; button: string }) {
  return <form className="rounded-[2rem] border border-emerald-400/20 bg-[#161918]/90 p-6"><h3 className="mb-5 flex items-center gap-3 text-2xl font-black text-white">{icon}{title}</h3><div className="grid gap-4">{fields.map((field) => <label key={field} className="block text-sm font-bold text-zinc-200">{field}<input className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring" placeholder={field.replace(" *", "")} /></label>)}</div><button type="button" className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-300 font-black uppercase tracking-[0.16em] text-black"><Send size={18} />{button}</button></form>;
}
