import type { PlaylistKitSummary, PlaylistTrackVoice } from "@/lib/data/playlists";
import { pickInitialTone, resolveToneTrack, sortTonesByChromaticOrder, type ToneResolution } from "@/lib/music/tones";

export type StudyVoice = "todos" | "tenor" | "contralto" | "soprano";

export type PlaylistStudySettings = {
  enabled: boolean;
  voice: StudyVoice;
  tonesByItem: Record<string, string>;
};

type StudyTrack = PlaylistKitSummary["tracks"][number];

export type PlaylistStudyTrackResolution = ToneResolution<StudyTrack> & {
  resolvedVoice: PlaylistTrackVoice | null;
  fallbackToneUsed: boolean;
};

const STUDY_VOICES: StudyVoice[] = ["todos", "tenor", "contralto", "soprano"];

export const DEFAULT_PLAYLIST_STUDY_SETTINGS: PlaylistStudySettings = {
  enabled: false,
  voice: "todos",
  tonesByItem: {},
};

export function getPlaylistStudyStorageKey(playlistId: string) {
  return `harmomus:playlist-study-mode:${playlistId}`;
}

function normalizeSettings(value: unknown): PlaylistStudySettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_PLAYLIST_STUDY_SETTINGS };

  const input = value as Partial<PlaylistStudySettings>;
  const tonesByItem = input.tonesByItem && typeof input.tonesByItem === "object" ? input.tonesByItem : {};

  return {
    enabled: Boolean(input.enabled),
    voice: STUDY_VOICES.includes(input.voice as StudyVoice) ? (input.voice as StudyVoice) : "todos",
    tonesByItem: Object.fromEntries(
      Object.entries(tonesByItem).filter((entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string" && Boolean(entry[1])),
    ),
  };
}

export function loadPlaylistStudySettings(playlistId: string): PlaylistStudySettings {
  if (typeof window === "undefined") return { ...DEFAULT_PLAYLIST_STUDY_SETTINGS };

  try {
    const raw = window.localStorage.getItem(getPlaylistStudyStorageKey(playlistId));
    if (!raw) return { ...DEFAULT_PLAYLIST_STUDY_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    console.error("[PlaylistStudyMode] failed to load settings", error);
    return { ...DEFAULT_PLAYLIST_STUDY_SETTINGS };
  }
}

export function savePlaylistStudySettings(playlistId: string, settings: PlaylistStudySettings) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(getPlaylistStudyStorageKey(playlistId), JSON.stringify(normalizeSettings(settings)));
}

export function getDefaultStudyTone(item: PlaylistKitSummary) {
  return pickInitialTone({
    availableTones: getStudyToneOptions(item),
    defaultTone: item.default_tone,
    originalTone: item.original_tone,
  });
}

export function getStudyToneOptions(item: PlaylistKitSummary) {
  return sortTonesByChromaticOrder(item.tracks.map((track) => track.tone));
}

function getVoicePreferredTracks(item: PlaylistKitSummary, voice: StudyVoice) {
  if (voice === "todos") {
    const allVoices = item.tracks.filter((track) => track.voice === "todos");
    return allVoices.length ? allVoices : item.tracks;
  }

  const exactVoice = item.tracks.filter((track) => track.voice === voice);
  if (exactVoice.length) return exactVoice;

  const allVoices = item.tracks.filter((track) => track.voice === "todos");
  return allVoices.length ? allVoices : item.tracks;
}

function resolveStudyTone(item: PlaylistKitSummary, requestedTone: string, voice: StudyVoice) {
  const voiceTracks = getVoicePreferredTracks(item, voice);
  return resolveToneTrack({
    tracks: voiceTracks,
    requestedTone,
    allowPitchShift: item.allow_pitch_shift,
    maxPitchShiftSemitones: item.max_pitch_shift_semitones,
    pickTrack: (tracks) => tracks.find((track) => track.voice === voice) ?? tracks.find((track) => track.voice === "todos") ?? tracks[0] ?? null,
  });
}

export function resolveStudyTrackForItem(item: PlaylistKitSummary, settings: PlaylistStudySettings): PlaylistStudyTrackResolution | null {
  const requestedTone = settings.tonesByItem[item.id] || getDefaultStudyTone(item);
  const fallbackTones = [item.default_tone, item.original_tone, getDefaultStudyTone(item), getStudyToneOptions(item)[0]].filter(Boolean) as string[];
  const tonesToTry = Array.from(new Set([requestedTone, ...fallbackTones].filter(Boolean)));

  for (const tone of tonesToTry) {
    const resolution = resolveStudyTone(item, tone, settings.voice);
    if (resolution.isAvailable && resolution.sourceTrack) {
      return {
        ...resolution,
        resolvedVoice: resolution.sourceTrack.voice,
        fallbackToneUsed: tone !== requestedTone,
      };
    }
  }

  const firstTrack = getVoicePreferredTracks(item, settings.voice)[0] ?? null;
  if (!firstTrack) return null;

  return {
    requestedTone: null,
    sourceTone: null,
    semitoneShift: 0,
    isExact: false,
    isPitchShifted: false,
    isAvailable: Boolean(firstTrack.streamUrl),
    reason: firstTrack.streamUrl ? "exact" : "no-source",
    sourceTrack: firstTrack,
    resolvedVoice: firstTrack.voice,
    fallbackToneUsed: true,
  };
}
