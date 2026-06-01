"use client";

import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderUp, Loader2, Music2, Sparkles, UploadCloud, Wand2, XCircle } from "lucide-react";

type ImportStatus = "idle" | "ready" | "uploading" | "success" | "error";

type UploadResult = {
  kitId: string;
  kitName: string;
  slug: string;
  r2Folder: string;
  created: boolean;
  uploadedFiles: number;
  skippedFiles: number;
  tones: string[];
  voices: string[];
  originalTone: string | null;
  defaultTone: string | null;
  editUrl: string;
};

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);
const TONE_RE = /^(A|A#|Bb|B|C|C#|Db|D|D#|Eb|E|F|F#|Gb|G|G#|Ab)$/i;
const TONE_ORDER = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

type FileWithRelativePath = File & { webkitRelativePath?: string; relativePath?: string };
type FileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
};
type FileSystemFileEntry = FileSystemEntry & { file: (success: (file: File) => void, error?: (error: DOMException) => void) => void };
type FileSystemDirectoryEntry = FileSystemEntry & { createReader: () => { readEntries: (success: (entries: FileSystemEntry[]) => void, error?: (error: DOMException) => void) => void } };
type DataTransferItemWithEntry = DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null };

function normalizePath(value: string) {
  return value.replace(/\\+/g, "/").split("/").filter(Boolean).join("/");
}

function cleanName(value: string) {
  return decodeURIComponent(value)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function isAudioFile(file: File) {
  return AUDIO_EXTENSIONS.has(getExtension(file.name));
}

function normalizeVoice(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized.includes("soprano")) return "soprano";
  if (normalized.includes("contralto") || normalized.includes("alto")) return "contralto";
  if (normalized.includes("tenor")) return "tenor";
  if (normalized.includes("baritono") || normalized.includes("barítono")) return "baritono";
  if (normalized.includes("baixo")) return "baixo";
  if (normalized.includes("todos") || normalized.includes("all") || normalized.includes("guia") || normalized.includes("completo")) return "todos";
  return "todos";
}

function getRelativePath(file: File) {
  const typed = file as FileWithRelativePath;
  return typed.relativePath || typed.webkitRelativePath || file.name;
}

function inferToneAndVoice(file: File) {
  const relativePath = normalizePath(getRelativePath(file));
  const parts = relativePath.split("/").filter(Boolean);
  const filename = parts[parts.length - 1] || file.name;
  const filenameWithoutExt = filename.replace(/\.[a-z0-9]+$/i, "");
  const relativeParts = parts.length > 1 ? parts.slice(1, -1) : [];

  let tone = "Original";
  let voice = normalizeVoice(filenameWithoutExt);

  const firstFolder = relativeParts[0]?.trim();
  const secondFolder = relativeParts[1]?.trim();

  if (firstFolder && TONE_RE.test(firstFolder)) tone = firstFolder;
  if (secondFolder) voice = normalizeVoice(secondFolder);

  const nameTone = filenameWithoutExt.match(/(?:^|\s|-|_)(A#|Bb|B|C#|Db|C|D#|Eb|D|E|F#|Gb|F|G#|Ab|G)(?:\s|-|_|$)/i);
  if (tone === "Original" && nameTone?.[1]) tone = nameTone[1];

  return { tone, voice };
}

function inferKitName(files: File[]) {
  const firstFile = files[0];
  if (!firstFile) return "";

  const relativePath = normalizePath(getRelativePath(firstFile));
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length > 1) return cleanName(parts[0]);
  return cleanName(parts[0] || firstFile.name);
}

function formatBytes(value: number) {
  if (!value) return "0 MB";
  const mb = value / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function sortTones(tones: string[]) {
  return [...tones].sort((a, b) => {
    const ai = TONE_ORDER.indexOf(a);
    const bi = TONE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function readFileEntry(entry: FileSystemFileEntry, pathPrefix = "") {
  return new Promise<File>((resolve, reject) => {
    entry.file((file) => {
      Object.defineProperty(file, "relativePath", {
        value: normalizePath(`${pathPrefix}/${file.name}`),
        configurable: true,
      });
      resolve(file);
    }, reject);
  });
}

function readDirectoryEntry(entry: FileSystemDirectoryEntry, pathPrefix = ""): Promise<File[]> {
  const reader = entry.createReader();
  const directoryPath = normalizePath(`${pathPrefix}/${entry.name}`);

  return new Promise((resolve, reject) => {
    const files: File[] = [];

    function readBatch() {
      reader.readEntries(async (entries) => {
        if (!entries.length) {
          resolve(files);
          return;
        }

        try {
          const nested = await Promise.all(entries.map((item) => readEntry(item, directoryPath)));
          files.push(...nested.flat());
          readBatch();
        } catch (error) {
          reject(error);
        }
      }, reject);
    }

    readBatch();
  });
}

function readEntry(entry: FileSystemEntry, pathPrefix = ""): Promise<File[]> {
  if (entry.isFile) return readFileEntry(entry as FileSystemFileEntry, pathPrefix).then((file) => [file]);
  if (entry.isDirectory) return readDirectoryEntry(entry as FileSystemDirectoryEntry, pathPrefix);
  return Promise.resolve([]);
}

async function extractDroppedFiles(event: DragEvent<HTMLDivElement>) {
  const items = Array.from(event.dataTransfer.items ?? []) as DataTransferItemWithEntry[];
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];

  if (!entries.length) return Array.from(event.dataTransfer.files ?? []);

  const files = await Promise.all(entries.map((entry) => readEntry(entry)));
  return files.flat();
}

export function KitBulkUpload() {
  const router = useRouter();
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [artist, setArtist] = useState("");
  const [kitNameOverride, setKitNameOverride] = useState("");
  const [originalTone, setOriginalTone] = useState("");
  const [defaultTone, setDefaultTone] = useState("");
  const [published, setPublished] = useState(false);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioFiles = useMemo(() => files.filter(isAudioFile), [files]);
  const totalSize = useMemo(() => audioFiles.reduce((sum, file) => sum + file.size, 0), [audioFiles]);
  const detectedKitName = useMemo(() => kitNameOverride.trim() || inferKitName(audioFiles), [kitNameOverride, audioFiles]);
  const detected = useMemo(() => {
    const tones = new Set<string>();
    const voices = new Set<string>();

    for (const file of audioFiles) {
      const parsed = inferToneAndVoice(file);
      if (parsed.tone !== "Original") tones.add(parsed.tone);
      voices.add(parsed.voice);
    }

    return {
      tones: sortTones(Array.from(tones)),
      voices: Array.from(voices).sort((a, b) => a.localeCompare(b)),
    };
  }, [audioFiles]);

  useEffect(() => {
    if (!detected.tones.length) return;
    setOriginalTone((current) => current || detected.tones[0]);
    setDefaultTone((current) => current || detected.tones[0]);
  }, [detected.tones]);

  const canImport = audioFiles.length > 0 && status !== "uploading";

  function receiveFiles(nextFiles: File[]) {
    setFiles(nextFiles);
    setError(null);
    setStatus(nextFiles.length ? "ready" : "idle");
  }

  function onFolderChange(event: ChangeEvent<HTMLInputElement>) {
    receiveFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onFilesChange(event: ChangeEvent<HTMLInputElement>) {
    receiveFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    try {
      receiveFiles(await extractDroppedFiles(event));
    } catch {
      receiveFiles(Array.from(event.dataTransfer.files ?? []));
    }
  }

  async function submitImport() {
    if (!canImport) return;

    setStatus("uploading");
    setError(null);

    try {
      const body = new FormData();
      body.append("name", detectedKitName);
      body.append("artist", artist.trim());
      body.append("originalTone", originalTone);
      body.append("defaultTone", defaultTone || originalTone);
      body.append("published", published ? "true" : "false");

      for (const file of audioFiles) {
        body.append("files", file);
        body.append("relativePaths", getRelativePath(file));
      }

      const response = await fetch("/api/admin/kits/upload", {
        method: "POST",
        body,
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível importar o kit.");
      }

      setStatus("success");
      router.replace(`/admin/kits/novo?importedKitId=${encodeURIComponent((data as UploadResult).kitId)}#kit-editor`);
      router.refresh();
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Erro inesperado ao importar kit.");
    }
  }

  function resetImport() {
    setFiles([]);
    setError(null);
    setStatus("idle");
    setKitNameOverride("");
    setArtist("");
    setOriginalTone("");
    setDefaultTone("");
    setPublished(false);
  }

  return (
    <section className="rounded-3xl border border-gold-500/20 bg-gradient-to-br from-gold-500/10 via-surface to-background p-4 shadow-premium sm:p-5">
      <div className="flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200">
          <Sparkles size={13} /> Importação premium
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Upload inteligente de kit completo</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
            Envie uma pasta completa ou áudios avulsos. O Harmomus cria o kit no banco/R2 e libera o editor preenchido logo abaixo nesta mesma página.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          className={`flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed p-5 text-center transition sm:min-h-[260px] ${
            isDragOver ? "border-gold-300 bg-gold-500/10" : "border-border bg-background/50"
          }`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-gold-500/30 bg-gold-500/10 text-gold-200">
            <UploadCloud size={24} />
          </div>
          <p className="mt-4 text-base font-semibold text-foreground">Arraste a pasta ou selecione os áudios</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">
            Estrutura recomendada: nome do kit / tom / voz.mp3. Ao selecionar pasta, o navegador pode pedir confirmação de segurança.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={status === "uploading"}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gold-500/40 bg-gold-500/10 px-5 py-3 text-sm font-semibold text-gold-100 transition hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FolderUp size={16} /> Selecionar pasta
            </button>
            <button
              type="button"
              onClick={() => filesInputRef.current?.click()}
              disabled={status === "uploading"}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface-muted px-5 py-3 text-sm font-semibold text-foreground transition hover:border-gold-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Music2 size={16} /> Selecionar arquivos
            </button>
          </div>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error Chromium supports folder selection through webkitdirectory.
            webkitdirectory="true"
            directory="true"
            className="hidden"
            onChange={onFolderChange}
          />
          <input ref={filesInputRef} type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" className="hidden" onChange={onFilesChange} />
        </div>

        <div className="rounded-3xl border border-border bg-background/50 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wand2 size={17} className="text-gold-300" /> Configuração antes de gerar o editor
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Áudios válidos</p>
              <p className="mt-2 text-2xl font-semibold text-white">{audioFiles.length}</p>
              <p className="mt-1 text-xs text-muted">{formatBytes(totalSize)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Ignorados</p>
              <p className="mt-2 text-2xl font-semibold text-white">{Math.max(0, files.length - audioFiles.length)}</p>
              <p className="mt-1 text-xs text-muted">Arquivos não-áudio</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-muted">Nome do kit</span>
              <input
                value={detectedKitName}
                onChange={(event) => setKitNameOverride(event.target.value)}
                placeholder="Ex: Grandioso És Tu"
                className="mt-2 w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-foreground outline-none ring-gold-400/40 focus:ring"
              />
            </label>

            <label className="block text-sm sm:col-span-2">
              <span className="text-muted">Artista</span>
              <input
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
                placeholder="Ex: Harpa Cristã, Foco em Canto..."
                className="mt-2 w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-foreground outline-none ring-gold-400/40 focus:ring"
              />
            </label>

            <label className="block text-sm">
              <span className="text-muted">Tom original</span>
              <select
                value={originalTone}
                onChange={(event) => setOriginalTone(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-foreground outline-none ring-gold-400/40 focus:ring"
              >
                <option value="">Selecione</option>
                {(detected.tones.length ? detected.tones : TONE_ORDER).map((tone) => (
                  <option key={tone} value={tone}>{tone}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-muted">Tom inicial</span>
              <select
                value={defaultTone}
                onChange={(event) => setDefaultTone(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-foreground outline-none ring-gold-400/40 focus:ring"
              >
                <option value="">Selecione</option>
                {(detected.tones.length ? detected.tones : TONE_ORDER).map((tone) => (
                  <option key={tone} value={tone}>{tone}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-surface/70 p-4 text-sm text-muted">
            <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} className="h-4 w-4 rounded border-border bg-surface-muted accent-gold-300" />
            Publicar kit automaticamente após importar
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gold-300">Tons detectados</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {detected.tones.length ? detected.tones.map((tone) => <span key={tone} className="rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs text-gold-100">{tone}</span>) : <span className="text-xs text-muted">Aguardando arquivos</span>}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Vozes detectadas</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {detected.voices.length ? detected.voices.map((voice) => <span key={voice} className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">{voice}</span>) : <span className="text-xs text-muted">Aguardando arquivos</span>}
              </div>
            </div>
          </div>

          {status === "uploading" ? (
            <div className="mt-5 rounded-2xl border border-gold-500/30 bg-gold-500/10 p-4">
              <div className="flex items-center gap-3 text-sm font-semibold text-gold-100">
                <Loader2 size={18} className="animate-spin" /> Importando e preparando editor nesta página...
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-gold-400" />
              </div>
            </div>
          ) : null}

          {status === "error" && error ? (
            <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
              <div className="flex items-center gap-2 font-semibold"><XCircle size={18} /> Falha ao importar</div>
              <p className="mt-2 text-xs leading-5 text-red-100/80">{error}</p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void submitImport()}
              disabled={!canImport}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gold-500/40 bg-gold-500/15 px-5 py-3 text-sm font-semibold text-gold-100 transition hover:bg-gold-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "uploading" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {status === "uploading" ? "Preparando editor..." : "Importar e abrir editor abaixo"}
            </button>
            <button
              type="button"
              onClick={resetImport}
              disabled={status === "uploading"}
              className="inline-flex items-center justify-center rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-muted transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
