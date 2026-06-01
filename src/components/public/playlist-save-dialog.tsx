"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";

interface PlaylistSummary {
  id: string;
  name: string;
  slug: string;
  kitCount?: number;
  kits?: { id: string; name: string; artist: string; cover_url: string | null }[];
}

interface PlaylistSaveDialogProps {
  open: boolean;
  kitId: string;
  kitSlug: string;
  kitName: string;
  onClose: () => void;
}

type Status = { type: "success" | "error"; message: string } | null;

export function PlaylistSaveDialog({ open, kitId, kitSlug, kitName, onClose }: PlaylistSaveDialogProps) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadPlaylists() {
      setLoading(true);
      setStatus(null);
      setCreatedSlug(null);

      try {
        const response = await fetch("/api/playlists", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar suas playlists.");
        }

        if (cancelled) return;

        const list = Array.isArray(data.playlists) ? data.playlists : [];
        setPlaylists(list);
        setSelectedPlaylistId((current) => current || list[0]?.id || "");
        setMode(list.length ? "existing" : "new");
      } catch (error) {
        if (!cancelled) {
          setStatus({ type: "error", message: error instanceof Error ? error.message : "Não foi possível carregar suas playlists." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPlaylists();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId],
  );

  async function addToExistingPlaylist() {
    if (!selectedPlaylistId) {
      setStatus({ type: "error", message: "Escolha uma playlist para adicionar este kit." });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch("/api/playlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId: selectedPlaylistId, kitId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível adicionar o kit à playlist.");
      }

      setStatus({ type: "success", message: selectedPlaylist ? `Kit adicionado à playlist ${selectedPlaylist.name}.` : "Kit adicionado à playlist." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Não foi possível adicionar o kit à playlist." });
    } finally {
      setSubmitting(false);
    }
  }

  async function createNewPlaylist() {
    const name = newPlaylistName.trim();
    if (!name) {
      setStatus({ type: "error", message: "Informe o nome da nova playlist." });
      return;
    }

    setSubmitting(true);
    setStatus(null);
    setCreatedSlug(null);

    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kitIds: [kitId] }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível criar a playlist.");
      }

      setCreatedSlug(data.slug ?? null);
      setNewPlaylistName("");
      setStatus({ type: "success", message: "Playlist criada com este kit." });

      const reload = await fetch("/api/playlists", { cache: "no-store" });
      const reloadData = await reload.json().catch(() => ({}));
      if (reload.ok && Array.isArray(reloadData.playlists)) {
        setPlaylists(reloadData.playlists);
        setSelectedPlaylistId(data.id ?? reloadData.playlists[0]?.id ?? "");
      }
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Não foi possível criar a playlist." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0d1019] shadow-[0_24px_90px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Salvar na playlist</p>
            <h2 className="mt-2 text-2xl font-black text-white">{kitName}</h2>
            <p className="mt-1 text-sm text-zinc-400">Adicione este kit a uma playlist existente ou crie uma nova.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-200 transition hover:bg-white/10" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("existing");
                setStatus(null);
              }}
              disabled={!playlists.length}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${mode === "existing" ? "bg-cyan-300 text-black" : "text-zinc-200 hover:bg-white/5"}`}
            >
              Playlist existente
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("new");
                setStatus(null);
              }}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${mode === "new" ? "bg-cyan-300 text-black" : "text-zinc-200 hover:bg-white/5"}`}
            >
              Criar nova
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-sm text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando playlists...
            </div>
          ) : mode === "existing" ? (
            <div className="space-y-3">
              {playlists.length ? (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {playlists.map((playlist) => {
                    const alreadyHasKit = Array.isArray(playlist.kits) && playlist.kits.some((kit) => kit.id === kitId);
                    const active = selectedPlaylistId === playlist.id;

                    return (
                      <button
                        key={playlist.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlaylistId(playlist.id);
                          setStatus(null);
                        }}
                        className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${active ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-white">{playlist.name}</span>
                          <span className="mt-1 block text-xs text-zinc-400">{playlist.kitCount ?? playlist.kits?.length ?? 0} kits{alreadyHasKit ? " • este kit já está nela" : ""}</span>
                        </span>
                        {active ? <Check className="h-5 w-5 shrink-0 text-cyan-200" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-zinc-300">
                  Você ainda não tem playlists. Crie uma nova para salvar este kit.
                </div>
              )}

              <button
                type="button"
                onClick={addToExistingPlaylist}
                disabled={submitting || !selectedPlaylistId || !playlists.length}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 font-black text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Adicionar à playlist
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-bold text-zinc-200">
                Nome da nova playlist
                <input
                  value={newPlaylistName}
                  onChange={(event) => {
                    setNewPlaylistName(event.target.value);
                    setStatus(null);
                  }}
                  maxLength={80}
                  placeholder="Ex.: Culto de domingo"
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/60"
                />
              </label>

              <button
                type="button"
                onClick={createNewPlaylist}
                disabled={submitting || !newPlaylistName.trim()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar playlist com este kit
              </button>
            </div>
          )}

          {status ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${status.type === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-rose-400/25 bg-rose-500/10 text-rose-100"}`}>
              {status.message}
              {createdSlug ? (
                <Link href={`/playlist/${createdSlug}`} className="mt-2 block font-bold text-cyan-200 hover:text-cyan-100">
                  Abrir playlist criada
                </Link>
              ) : null}
            </div>
          ) : null}

          <Link href={`/criar-playlist?kit=${encodeURIComponent(kitSlug)}`} className="block text-center text-xs font-bold uppercase tracking-[0.16em] text-zinc-400 transition hover:text-cyan-200">
            Abrir criador avançado de playlist
          </Link>
        </div>
      </div>
    </div>
  );
}
