import Link from "next/link";
import { redirect } from "next/navigation";

import { DeletePlaylistButton } from "@/components/public/delete-playlist-button";
import { ManagePlaylistKitsList } from "@/components/public/manage-playlist-kits-list";
import { PlaylistVisibilityToggle } from "@/components/public/playlist-visibility-toggle";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { RenamePlaylistForm } from "@/components/public/rename-playlist-form";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getCurrentUserPlaylists } from "@/lib/data/playlists";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function validatePlaylistOwnership(playlistId: string) {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest || !(context.effectiveSlug === "plus" || context.effectiveSlug === "premium")) {
    return null;
  }

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const supabase = createSupabaseAdminClient() as any;

  const { data: playlist, error } = await supabase
    .from("playlists")
    .select("id, user_id, is_public, name, slug")
    .eq("id", playlistId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!playlist) return null;

  return { playlist, supabase, user };
}

async function removeKitFromPlaylistAction(formData: FormData) {
  "use server";

  const playlistId = String(formData.get("playlistId") ?? "");
  const kitId = String(formData.get("kitId") ?? "");

  if (!playlistId || !kitId) return;

  const validated = await validatePlaylistOwnership(playlistId);
  if (!validated) return;

  const { playlist, supabase } = validated;

  const { error } = await supabase
    .from("playlist_items")
    .delete()
    .eq("playlist_id", playlist.id)
    .eq("kit_id", kitId);

  if (error) throw new Error(error.message);

  redirect("/minhas-playlists");
}

async function renamePlaylist(formData: FormData) {
  "use server";

  const playlistId = String(formData.get("playlistId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!playlistId || !name) return;

  const validated = await validatePlaylistOwnership(playlistId);
  if (!validated) return;

  const { playlist, supabase, user } = validated;

  if (playlist.name === name) {
    redirect("/minhas-playlists");
  }

  const { error } = await supabase
    .from("playlists")
    .update({ name })
    .eq("id", playlist.id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  redirect("/minhas-playlists");
}

async function updatePlaylistVisibility(formData: FormData) {
  "use server";

  const playlistId = String(formData.get("playlistId") ?? "");
  const isPublic = String(formData.get("isPublic") ?? "false") === "true";

  if (!playlistId) return;

  const validated = await validatePlaylistOwnership(playlistId);
  if (!validated) return;

  const { playlist, supabase, user } = validated;

  const { error } = await supabase
    .from("playlists")
    .update({ is_public: isPublic })
    .eq("id", playlist.id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  redirect("/minhas-playlists");
}

async function deletePlaylist(formData: FormData) {
  "use server";

  const playlistId = String(formData.get("playlistId") ?? "");
  if (!playlistId) return;

  const validated = await validatePlaylistOwnership(playlistId);
  if (!validated) return;

  const { playlist, supabase, user } = validated;

  const { error: itemsError } = await supabase.from("playlist_items").delete().eq("playlist_id", playlist.id);
  if (itemsError) throw new Error(itemsError.message);

  const { error: deleteError } = await supabase.from("playlists").delete().eq("id", playlist.id).eq("user_id", user.id);
  if (deleteError) throw new Error(deleteError.message);

  redirect("/minhas-playlists");
}

export default async function MinhasPlaylistsPage() {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) redirect("/login");
  if (!(context.effectiveSlug === "plus" || context.effectiveSlug === "premium")) redirect("/assinatura");

  const playlists = await getCurrentUserPlaylists();
  const publicBaseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    ""
  ).replace(/\/$/, "");

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-background px-4 py-6 text-white md:px-6">
        <section className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(39,76,255,0.18),transparent_45%),rgba(13,16,28,0.96)] p-6 shadow-2xl shadow-black/20">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">Harmomus</p>
                <h1 className="mt-2 text-3xl font-semibold">Minhas Playlists</h1>
                <p className="mt-3 max-w-2xl text-sm text-zinc-300 md:text-base">
                  Organize seus kits favoritos por repertório, culto, evento ou estudo vocal.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Playlists criadas</p>
                <p className="mt-2 text-3xl font-semibold">{playlists.length}</p>
              </div>
            </div>
          </div>

          {playlists.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-surface/40 p-10 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 text-3xl">
                🎧
              </div>
              <h2 className="mt-6 text-2xl font-semibold">Você ainda não criou playlists</h2>
              <p className="mt-3 max-w-lg text-sm text-zinc-400 md:text-base">
                Monte playlists com seus kits favoritos para estudar divisão vocal, ensaiar repertórios e acessar tudo rapidamente.
              </p>
              <Link
                href="/todos-os-kits"
                className="mt-6 inline-flex items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Explorar kits
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {playlists.map((playlist) => {
                const shareUrl = `/playlist/${playlist.slug}`;
                const absoluteShareUrl = publicBaseUrl ? `${publicBaseUrl}${shareUrl}` : shareUrl;
                const whatsappShare = `https://wa.me/?text=${encodeURIComponent(`Ouça minha playlist no Harmomus: ${absoluteShareUrl}`)}`;

                return (
                  <div
                    key={playlist.id}
                    className="group overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] transition hover:border-cyan-400/30 hover:bg-white/[0.08]"
                  >
                    <Link href={shareUrl}>
                      <div className="relative aspect-[16/9] overflow-hidden border-b border-white/5 bg-black/30">
                        {playlist.covers.length > 0 ? (
                          <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-[1px] bg-white/5">
                            {playlist.covers.map((cover) => (
                              <div key={cover.id} className="relative overflow-hidden bg-black/30">
                                {cover.cover_url ? (
                                  <img
                                    src={cover.cover_url}
                                    alt={cover.name}
                                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs text-zinc-500">
                                    Sem capa
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-zinc-500">
                            Playlist vazia
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-zinc-300">
                              {playlist.isPublic ? "Playlist pública" : "Playlist privada"}
                            </p>
                            <h2 className="mt-1 text-2xl font-semibold leading-tight">{playlist.name}</h2>
                          </div>

                          <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-sm text-zinc-100 backdrop-blur">
                            {playlist.kitCount} kits
                          </div>
                        </div>
                      </div>
                    </Link>

                    <div className="space-y-4 p-5">
                      <ManagePlaylistKitsList
                        playlistId={playlist.id}
                        kits={playlist.kits}
                        removeKitAction={removeKitFromPlaylistAction}
                      />

                      <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-zinc-400">
                        <span>
                          Criada em {new Intl.DateTimeFormat("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          }).format(new Date(playlist.createdAt))}
                        </span>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={shareUrl}
                            className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-400/20"
                          >
                            Abrir
                          </Link>

                          <RenamePlaylistForm
                            playlistId={playlist.id}
                            playlistName={playlist.name}
                            renamePlaylistAction={renamePlaylist}
                          />

                          <PlaylistVisibilityToggle
                            playlistId={playlist.id}
                            isPublic={playlist.isPublic}
                            updateVisibilityAction={updatePlaylistVisibility}
                          />

                          <a
                            href={whatsappShare}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                          >
                            Compartilhar
                          </a>

                          <DeletePlaylistButton
                            playlistId={playlist.id}
                            playlistName={playlist.name}
                            deletePlaylistAction={deletePlaylist}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </PublicAppShell>
  );
}
