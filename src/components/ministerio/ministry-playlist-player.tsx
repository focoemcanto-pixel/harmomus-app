"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleHelp, Clock3, ExternalLink, Music2, Play, RotateCcw } from "lucide-react";

type StudyStatus = "not_studied" | "studied" | "doubt" | "review";

type MinistryPlaylistTrack = {
  id: string;
  position: number;
  name: string;
  artist: string | null;
  coverUrl: string | null;
  href: string;
  kitId?: string | null;
  studyStatus?: StudyStatus;
};

const STUDY_STATUS_OPTIONS: Array<{ status: StudyStatus; label: string; icon: typeof Circle; className: string; activeClassName: string }> = [
  {
    status: "not_studied",
    label: "Não estudada",
    icon: Circle,
    className: "border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/10",
    activeClassName: "border-zinc-300/30 bg-zinc-300/10 text-zinc-100",
  },
  {
    status: "studied",
    label: "Estudei",
    icon: CheckCircle2,
    className: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20",
    activeClassName: "border-emerald-300/40 bg-emerald-400/20 text-emerald-50",
  },
  {
    status: "doubt",
    label: "Tenho dúvida",
    icon: CircleHelp,
    className: "border-amber-300/25 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
    activeClassName: "border-amber-300/40 bg-amber-400/20 text-amber-50",
  },
  {
    status: "review",
    label: "Preciso revisar",
    icon: RotateCcw,
    className: "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100 hover:bg-fuchsia-400/20",
    activeClassName: "border-fuchsia-300/40 bg-fuchsia-400/20 text-fuchsia-50",
  },
];

function statusLabel(status: StudyStatus) {
  return STUDY_STATUS_OPTIONS.find((option) => option.status === status)?.label ?? "Não estudada";
}

function statusBadgeClass(status: StudyStatus) {
  if (status === "studied") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (status === "doubt") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (status === "review") return "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100";
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

type MinistryPlaylistPlayerProps = {
  tracks: MinistryPlaylistTrack[];
  repertoireId?: string;
  updateStudyStatusAction?: (formData: FormData) => Promise<void>;
};

export function MinistryPlaylistPlayer({ tracks, repertoireId, updateStudyStatusAction }: MinistryPlaylistPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [lastPlayedIndex, setLastPlayedIndex] = useState<number | null>(null);

  const currentTrack = currentIndex === null ? null : tracks[currentIndex] ?? null;
  const nextTrack = currentIndex === null ? tracks[0] ?? null : tracks[currentIndex + 1] ?? null;
  const lastPlayedTrack = lastPlayedIndex === null ? null : tracks[lastPlayedIndex] ?? null;

  const playbackLabel = useMemo(() => {
    if (!currentTrack) return "Pronto para iniciar";
    return `Tocando ${currentIndex! + 1} de ${tracks.length}`;
  }, [currentIndex, currentTrack, tracks.length]);

  function playTrack(index: number) {
    setLastPlayedIndex(currentIndex);
    setCurrentIndex(index);
  }

  function playPlaylist() {
    if (!tracks.length) return;
    playTrack(0);
  }

  function goToPrevious() {
    if (currentIndex === null || currentIndex <= 0) return;
    playTrack(currentIndex - 1);
  }

  function goToNext() {
    if (currentIndex === null || currentIndex >= tracks.length - 1) return;
    playTrack(currentIndex + 1);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 via-white/[0.04] to-fuchsia-500/10 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/30 text-cyan-100 shadow-2xl shadow-cyan-950/30">
                {currentTrack?.coverUrl ? (
                  <img src={currentTrack.coverUrl} alt={currentTrack.name} className="h-full w-full object-cover" />
                ) : (
                  <Music2 className="h-9 w-9" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">{playbackLabel}</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{currentTrack?.name ?? "Playlist ministerial"}</h3>
                <p className="mt-1 text-sm text-zinc-400">{currentTrack?.artist ?? "Selecione Reproduzir Playlist para começar pela primeira música."}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToPrevious}
                disabled={currentIndex === null || currentIndex <= 0}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <button
                type="button"
                onClick={playPlaylist}
                disabled={!tracks.length}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" /> Reproduzir Playlist
              </button>
              <button
                type="button"
                onClick={goToNext}
                disabled={currentIndex === null || currentIndex >= tracks.length - 1}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-[2rem] border border-white/10 bg-black/20 p-4">
          <StatusPill label="Música atual" track={currentTrack} tone="current" />
          <StatusPill label="Próxima música" track={nextTrack} tone="next" />
          <StatusPill label="Última reproduzida" track={lastPlayedTrack} tone="last" />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
        {tracks.map((track, index) => {
          const isCurrent = index === currentIndex;
          const isNext = currentIndex !== null && index === currentIndex + 1;
          const isLastPlayed = index === lastPlayedIndex;
          const studyStatus = track.studyStatus ?? "not_studied";

          return (
            <div
              key={track.id}
              className={`grid gap-4 border-b border-white/10 p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center ${
                isCurrent
                  ? "bg-cyan-300/12 ring-1 ring-inset ring-cyan-300/35"
                  : isNext
                    ? "bg-emerald-400/10"
                    : isLastPlayed
                      ? "bg-fuchsia-400/10"
                      : "bg-transparent"
              }`}
            >
              <button type="button" onClick={() => playTrack(index)} className="group flex w-full items-center gap-4 text-left">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-zinc-300">
                  {track.coverUrl ? <img src={track.coverUrl} alt={track.name} className="h-full w-full object-cover" /> : track.position}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-400">{track.position}.</span>
                    <h3 className="truncate text-lg font-semibold text-white group-hover:text-cyan-100">{track.name}</h3>
                  </div>
                  <p className="text-sm text-zinc-400">{track.artist || "Música da escala"}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {isCurrent ? <span className="rounded-full bg-cyan-300 px-2 py-1 text-slate-950">Atual</span> : null}
                    {isNext ? <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-emerald-100">Próxima</span> : null}
                    {isLastPlayed ? <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-2 py-1 text-fuchsia-100">Última reproduzida</span> : null}
                    <span className={`rounded-full border px-2 py-1 ${statusBadgeClass(studyStatus)}`}>{statusLabel(studyStatus)}</span>
                  </div>
                </div>
              </button>

              <div className="flex flex-wrap gap-2 md:justify-end">
                {updateStudyStatusAction && repertoireId ? (
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {STUDY_STATUS_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isActive = studyStatus === option.status;

                      return (
                        <form key={option.status} action={updateStudyStatusAction}>
                          <input type="hidden" name="repertoire_id" value={repertoireId} />
                          <input type="hidden" name="item_id" value={track.id} />
                          <input type="hidden" name="kit_id" value={track.kitId ?? ""} />
                          <input type="hidden" name="study_status" value={option.status} />
                          <button
                            disabled={isActive}
                            className={`inline-flex w-fit items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-default ${isActive ? option.activeClassName : option.className}`}
                          >
                            <Icon className="h-4 w-4" /> {option.label}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                ) : null}
                <Link href={track.href} className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
                  Abrir música <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ label, track, tone }: { label: string; track: MinistryPlaylistTrack | null; tone: "current" | "next" | "last" }) {
  const toneClass = {
    current: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
    next: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    last: "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100",
  }[tone];

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
        <Clock3 className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold text-white">{track?.name ?? "—"}</p>
      <p className="truncate text-xs text-zinc-300">{track?.artist ?? "Aguardando navegação"}</p>
    </div>
  );
}
