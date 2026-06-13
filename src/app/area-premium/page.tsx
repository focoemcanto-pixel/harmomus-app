import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, Headphones, Heart, ListMusic, MessageCircle, Music2, PlayCircle, RotateCw, Star, Trophy } from "lucide-react";

import { PremiumSongRequestForm } from "@/components/public/premium-song-request-form";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { PremiumToneRequestForm } from "@/components/public/premium-tone-request-form";
import { getCurrentUser, getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { canSubmitPremiumRequests } from "@/lib/auth/ministry-access";
import { getGlobalTopKits, getRecommendedKits, getUserRecentActivities, type RecentActivity, type TopKit } from "@/lib/data/premium-analytics";
import { getPublishedKits, type PublicKit } from "@/lib/data/public-kits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DashboardKit = {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  cover_url: string | null;
  metric?: string;
  badge?: string;
};

type PlaylistStats = {
  count: number;
  previews: string[];
};

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

function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
}

function statusLabel(status?: string | null) {
  if (status === "pending") return "Pendente";
  if (status === "reviewing") return "Em análise";
  if (status === "approved") return "Aprovado";
  if (status === "done") return "Concluído";
  if (status === "rejected") return "Rejeitado";
  return status || "—";
}

function typeLabel(type?: string | null) {
  if (type === "tone") return "Solicitação de tom";
  if (type === "feedback") return "Feedback";
  return "Sugestão de kit";
}

function toDashboardKit(kit: any, extra: Partial<DashboardKit> = {}): DashboardKit {
  return {
    id: kit.id,
    slug: kit.slug,
    name: kit.name,
    artist: kit.artist ?? null,
    cover_url: kit.cover_url ?? kit.coverUrl ?? null,
    ...extra,
  };
}

async function getFavoriteKits(userId: string, limit = 8): Promise<DashboardKit[]> {
  if (!userId) return [];
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("kit_favorites")
    .select("created_at,kits!inner(id,slug,name,artist,cover_url,published)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? [])
    .filter((row: any) => row.kits?.published)
    .map((row: any) => toDashboardKit(row.kits, { badge: "Favorito" }));
}

async function getGlobalFavoriteKits(limit = 5): Promise<DashboardKit[]> {
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("kit_favorites")
    .select("kit_id,kits!inner(id,slug,name,artist,cover_url,published)")
    .limit(5000);

  if (error) return [];
  const counts = new Map<string, { count: number; kit: any }>();
  for (const row of data ?? []) {
    if (!row.kits?.published || !row.kit_id) continue;
    const current = counts.get(row.kit_id) ?? { count: 0, kit: row.kits };
    current.count += 1;
    counts.set(row.kit_id, current);
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ count, kit }) => toDashboardKit(kit, { metric: `${count} favoritos` }));
}

async function getPlaylistStats(userId: string): Promise<PlaylistStats> {
  if (!userId) return { count: 0, previews: [] };
  const supabase = createSupabaseAdminClient() as any;
  const { data } = await supabase
    .from("playlists")
    .select("id,name")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(4);
  return {
    count: data?.length ?? 0,
    previews: ((data ?? []) as Array<{ name?: string | null }>).map((item) => item.name).filter((name): name is string => Boolean(name)),
  };
}

export default async function AreaPremiumPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const requestedKitSlug = typeof params.kit === "string" ? params.kit : "";
  const requestedKitName = typeof params.nome === "string" ? decodeURIComponent(params.nome) : "";

  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (context.effectiveSlug !== "premium") redirect("/assinatura");

  const authUser = await getCurrentUser();
  const profileId = context.profile?.id ?? "";
  const favoriteUserId = authUser?.id ?? profileId;
  const supabaseAdmin = createSupabaseAdminClient() as any;
  const monthStart = startOfMonthIso();

  const [topSite, recommendedKits, activities, allKits, premiumRequestsResponse, monthlySongRequestCountResponse, favoriteKits, globalFavoriteKits, playlistStats] = await Promise.all([
    getGlobalTopKits(5).catch(() => [] as TopKit[]),
    profileId ? getRecommendedKits(profileId, 8).catch(() => [] as TopKit[]) : Promise.resolve([] as TopKit[]),
    profileId ? getUserRecentActivities(profileId, 8).catch(() => [] as RecentActivity[]) : Promise.resolve([] as RecentActivity[]),
    getPublishedKits().catch(() => [] as PublicKit[]),
    profileId
      ? supabaseAdmin
          .from("premium_requests")
          .select("id,request_type,song_name,artist_name,desired_tone,voice_part,status,created_at,updated_at,delivered_kit_slug,delivered_at")
          .eq("user_id", profileId)
          .order("created_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] }),
    profileId
      ? supabaseAdmin
          .from("premium_requests")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profileId)
          .eq("request_type", "song")
          .gte("created_at", monthStart)
      : Promise.resolve({ count: 0 }),
    getFavoriteKits(favoriteUserId, 8),
    getGlobalFavoriteKits(5),
    getPlaylistStats(favoriteUserId),
  ]);

  const userPremiumRequests = premiumRequestsResponse?.data ?? [];
  const monthlySongRequests = monthlySongRequestCountResponse?.count ?? 0;
  const remainingSuggestions = Math.max(0, 3 - monthlySongRequests);
  const continueStudying = Array.from(new Map(activities.filter((item) => item.kit_slug).map((item) => [item.kit_slug, item])).values()).slice(0, 3);

  const toneRequestKits = allKits.slice(0, 500).map((kit) => ({
    id: kit.id,
    slug: kit.slug,
    name: kit.name,
    artist: kit.artist ?? "Kit vocal",
  }));

  const name = firstName(context.profile?.full_name, context.profile?.email);
  const avatar = context.profile?.avatar_url ?? null;
  const joinedAt = formatDate(context.profile?.created_at);
  const totalUserPlays = activities.length;

  return (
    <PublicAppShell>
      <main className="min-h-screen overflow-x-hidden bg-[#06080d] text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(34,197,94,0.18),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.2),transparent_35%),radial-gradient(circle_at_45%_80%,rgba(250,204,21,0.1),transparent_35%)]" />
        <section className="relative mx-auto max-w-7xl px-3 py-6 md:px-8 md:py-12">
          <div className="overflow-hidden rounded-[1.5rem] border border-yellow-300/20 bg-gradient-to-br from-emerald-950/50 via-zinc-950/95 to-violet-950/45 shadow-[0_0_120px_rgba(250,204,21,0.12)] md:rounded-[2rem]">
            <div className="grid min-w-0 gap-6 p-4 md:grid-cols-[0.8fr_1.2fr] md:p-10 lg:p-12">
              <div className="min-w-0 md:block">
                <div className="relative h-24 w-24 shrink-0 md:h-40 md:w-40">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 via-emerald-300 to-cyan-300 blur-xl opacity-45" />
                  <div className="relative h-full w-full overflow-hidden rounded-full border-4 border-yellow-300 bg-zinc-900 shadow-[0_0_28px_rgba(250,204,21,0.45)]">
                    {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-4xl font-bold md:text-5xl">{name.slice(0, 1).toUpperCase()}</div>}
                  </div>
                  <div className="absolute -right-1 top-3 grid h-8 w-8 place-items-center rounded-full border border-yellow-100 bg-yellow-300 text-black shadow-[0_0_20px_rgba(250,204,21,0.8)] md:top-4 md:h-9 md:w-9"><Crown size={17} /></div>
                </div>
                <div className="mt-6 min-w-0">
                  <p className="inline-flex items-center gap-2 rounded-full bg-yellow-300 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-black"><Star size={15} fill="currentColor" /> Inscrição premium</p>
                  <h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight text-white sm:text-4xl md:text-6xl">Sua central premium de estudo vocal</h1>
                  <p className="mt-4 max-w-full break-words text-base text-zinc-300 md:text-xl">{context.profile?.email}, organize seus kits, acompanhe suas sugestões e volte rápido ao estudo.</p>
                </div>
              </div>

              <div className="grid min-w-0 content-center gap-3 grid-cols-2 md:gap-4">
                {[
                  [String(totalUserPlays), "Reproduções recentes", Headphones],
                  [String(favoriteKits.length), "Favoritos", Heart],
                  [`${monthlySongRequests}/3`, "Sugestões do mês", MessageCircle],
                  [joinedAt, "Membro desde", Crown],
                ].map(([value, label, Icon]) => (
                  <div key={String(label)} className="min-w-0 rounded-2xl border border-emerald-400/25 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] md:rounded-3xl md:p-6">
                    <Icon className="mb-3 text-emerald-300" size={22} />
                    <p className="text-3xl font-black text-emerald-300 md:text-4xl">{String(value)}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-400 md:text-sm md:tracking-[0.18em]">{String(label)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr] md:mt-8">
            <PremiumPanel title="Continue estudando" icon={<PlayCircle className="text-emerald-300" />}>
              {continueStudying.length ? <div className="grid gap-3">
                {continueStudying.map((item) => (
                  <Link key={item.id} href={item.kit_slug ? `/biblioteca/${item.kit_slug}` : "#"} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 transition hover:border-emerald-300/50 hover:bg-white/[0.07] md:gap-4 md:p-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-200 md:h-12 md:w-12"><Headphones size={20} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white md:text-base">{item.label.replace(/^Ouviu:\s*/i, "")}</p>
                      <p className="truncate text-xs text-zinc-400 md:text-sm">Último estudo em {formatDate(item.created_at)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-black">Continuar</span>
                  </Link>
                ))}
              </div> : <EmptyState text="Quando você ouvir kits, seus últimos estudos aparecerão aqui para continuar rápido." />}
            </PremiumPanel>

            <PremiumPanel title="Minhas playlists" icon={<ListMusic className="text-cyan-300" />}>
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
                <p className="text-4xl font-black text-cyan-300">{playlistStats.count}</p>
                <p className="mt-1 text-sm uppercase tracking-[0.16em] text-zinc-400">playlists criadas</p>
                {playlistStats.previews.length ? <div className="mt-4 flex flex-wrap gap-2">{playlistStats.previews.map((item: string) => <span key={item} className="max-w-full truncate rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">{item}</span>)}</div> : <p className="mt-4 text-sm text-zinc-400">Monte listas para culto, ensaio, aquecimento ou repertório.</p>}
                <Link href="/minhas-playlists" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-black"><RotateCw size={16} /> Abrir modo estudo</Link>
              </div>
            </PremiumPanel>
          </div>

          <PremiumPanel title="Meus favoritos" icon={<Heart className="text-rose-300" />} className="mt-6 md:mt-8">
            {favoriteKits.length ? <KitCarousel kits={favoriteKits} /> : <EmptyState text="Favorite os kits que você mais usa para montar seu repertório premium." />}
          </PremiumPanel>

          <div className="mt-6 grid gap-6 lg:grid-cols-2 md:mt-8">
            <PremiumPanel title="Tendências da comunidade" icon={<Trophy className="text-cyan-300" />}>
              <Ranking items={topSite} empty="Ainda não existem reproduções registradas no site." />
            </PremiumPanel>
            <PremiumPanel title="Mais favoritados" icon={<Star className="text-yellow-300" />}>
              {globalFavoriteKits.length ? <FavoriteRanking items={globalFavoriteKits} /> : <EmptyState text="Os kits mais favoritados aparecerão aqui assim que a comunidade começar a favoritar." />}
            </PremiumPanel>
          </div>

          <PremiumPanel title="Recomendados para você" icon={<Music2 className="text-emerald-300" />} className="mt-6 md:mt-8">
            {recommendedKits.length ? <KitCarousel kits={recommendedKits.map((kit) => toDashboardKit(kit, { badge: "Recomendado" }))} /> : <EmptyState text="As recomendações aparecerão depois que houver histórico real de reprodução no app." />}
          </PremiumPanel>

          <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr] md:mt-8">
            <PremiumPanel title="Minhas solicitações" icon={<MessageCircle className="text-emerald-300" />}>
              {userPremiumRequests.length ? <div className="grid gap-3">
                {userPremiumRequests.map((item: any) => (
                  <div key={item.id} className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">{typeLabel(item.request_type)}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-zinc-200">{statusLabel(item.status)}</span>
                    </div>
                    <h3 className="mt-4 break-words text-lg font-black text-white">{item.song_name}</h3>
                    <p className="mt-1 break-words text-sm text-zinc-400">{item.artist_name || (item.request_type === "feedback" ? "Mensagem enviada" : "Kit vocal")}</p>
                    {item.request_type === "tone" ? <p className="mt-2 text-sm text-emerald-200">Tom: {item.desired_tone || "—"}{item.voice_part ? ` • ${item.voice_part}` : ""}</p> : null}
                    <p className="mt-4 text-xs uppercase tracking-[0.16em] text-zinc-500">Criado em {formatDate(item.created_at)}</p>
                    {item.status === "done" && item.delivered_kit_slug ? <Link href={`/biblioteca/${item.delivered_kit_slug}`} className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-300 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-black">Abrir kit entregue</Link> : null}
                  </div>
                ))}
              </div> : <EmptyState text="Quando você enviar uma sugestão de kit ou solicitar um tom, o andamento aparecerá aqui." />}
            </PremiumPanel>

            <div className="min-w-0 space-y-6">
              <div className="rounded-[2rem] border border-yellow-300/20 bg-yellow-300/10 p-5 text-sm text-yellow-50">
                <p className="font-black uppercase tracking-[0.16em] text-yellow-200">Sugestões de kits</p>
                <p className="mt-2 text-zinc-200">Você usou <strong>{monthlySongRequests}/3</strong> sugestões neste mês. Restam <strong>{remainingSuggestions}</strong>.</p>
              </div>
              {canSubmitPremiumRequests(context) ? <PremiumSongRequestForm /> : <EmptyState text="No seu ministério, apenas owner/manager podem enviar sugestões de kits." />}
              {canSubmitPremiumRequests(context) ? <PremiumToneRequestForm kits={toneRequestKits} initialKitSlug={requestedKitSlug} initialKitName={requestedKitName} /> : null}
            </div>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}

function PremiumPanel({ title, icon, children, className = "" }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 overflow-hidden rounded-[1.5rem] border border-emerald-400/20 bg-[#111513]/88 p-4 shadow-[0_0_80px_rgba(16,185,129,0.08)] md:rounded-[2rem] md:p-6 ${className}`}><h2 className="mb-5 flex min-w-0 items-center gap-3 text-2xl font-black text-white md:text-3xl">{icon}<span className="min-w-0 truncate">{title}</span></h2>{children}</section>;
}

function Ranking({ items, empty }: { items: TopKit[]; empty: string }) {
  if (!items.length) return <EmptyState text={empty} />;
  return <div className="space-y-2">{items.map((item, index) => <Link href={`/biblioteca/${item.slug}`} key={item.id} className="flex min-w-0 items-center gap-3 border-b border-white/10 py-4 transition hover:bg-white/[0.03] last:border-b-0 md:gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-300 text-sm font-black text-black md:h-14 md:w-14 md:text-lg">{index + 1}</div><p className="min-w-0 flex-1 truncate text-sm font-bold text-white md:text-lg">{item.name}</p><p className="shrink-0 text-xs font-black text-emerald-400 md:text-base">{item.plays} plays</p></Link>)}</div>;
}

function FavoriteRanking({ items }: { items: DashboardKit[] }) {
  return <div className="space-y-2">{items.map((item, index) => <Link href={`/biblioteca/${item.slug}`} key={item.id} className="flex min-w-0 items-center gap-3 border-b border-white/10 py-4 transition hover:bg-white/[0.03] last:border-b-0 md:gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-yellow-300 to-emerald-300 text-sm font-black text-black md:h-14 md:w-14 md:text-lg">{index + 1}</div><p className="min-w-0 flex-1 truncate text-sm font-bold text-white md:text-lg">{item.name}</p><p className="shrink-0 text-xs font-black text-yellow-300 md:text-base">{item.metric}</p></Link>)}</div>;
}

function KitCarousel({ kits }: { kits: DashboardKit[] }) {
  return <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6"><div className="flex gap-4">{kits.map((kit) => <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="group w-[220px] shrink-0 overflow-hidden rounded-3xl border border-emerald-400/20 bg-white/[0.04] transition hover:-translate-y-1 hover:border-emerald-300/60 md:w-[300px]"><div className="aspect-video overflow-hidden bg-zinc-900">{kit.cover_url ? <img src={kit.cover_url} alt={kit.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-zinc-500">Harmomus</div>}</div><div className="p-4">{kit.badge ? <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">{kit.badge}</span> : null}<h3 className="mt-3 line-clamp-2 text-base font-bold text-white md:text-lg">{kit.name}</h3><p className="mt-1 truncate text-sm text-zinc-400">{kit.artist ?? "Kit vocal premium"}</p>{kit.metric ? <p className="mt-3 text-sm font-black text-yellow-300">{kit.metric}</p> : null}</div></Link>)}</div></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-sm text-zinc-300">{text}</div>;
}
