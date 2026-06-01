"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Save } from "lucide-react";

type MediaItem = {
  id: string;
  created_at: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  public_url: string;
  purpose: string | null;
  metadata: Record<string, unknown> | null;
};

function formatSize(size: number | null) {
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [purpose, setPurpose] = useState("campaign");
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadMedia() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/comunicacao/media", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao carregar biblioteca.");
      setItems(json?.data ?? []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar biblioteca.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMedia();
  }, []);

  function handleFile(file?: File | null) {
    if (!file) return;
    setFileName(file.name);
    setFileType(file.type);
    setFileSize(file.size);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function saveMedia() {
    if (!fileName.trim()) return setStatus("Informe o nome do arquivo.");
    if (!publicUrl.trim()) return setStatus("Informe a URL pública manual.");

    setIsSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/comunicacao/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: fileName,
          file_type: fileType,
          file_size: fileSize,
          public_url: publicUrl,
          purpose,
          metadata: { source: "manual", hasLocalPreview: Boolean(preview) },
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao salvar mídia.");
      setItems((current) => [json.data, ...current]);
      setStatus("Mídia salva em communication_assets.");
      setFileName("");
      setFileType("");
      setFileSize(null);
      setPublicUrl("");
      setPreview(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar mídia.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200"><ImagePlus size={20} /></span>
          <div><h3 className="text-lg font-semibold text-white">Nova mídia</h3><p className="text-sm text-slate-400">Preview local + URL pública manual para V1.</p></div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-sm text-slate-300">Arquivo local para preview<input type="file" onChange={(event) => handleFile(event.target.files?.[0])} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white" /></label>
          {preview ? <img src={preview} alt="Preview local" className="max-h-56 w-full rounded-2xl object-contain ring-1 ring-white/10" /> : null}
          <label className="block text-sm text-slate-300">Nome do arquivo<input value={fileName} onChange={(e) => setFileName(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white" /></label>
          <label className="block text-sm text-slate-300">URL pública<input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://..." className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white" /></label>
          <label className="block text-sm text-slate-300">Finalidade<input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white" /></label>
          <button onClick={saveMedia} disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60">{isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {isSaving ? "Salvando..." : "Salvar mídia"}</button>
          {status ? <p className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{status}</p> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <h3 className="text-lg font-semibold text-white">Biblioteca salva</h3>
        {isLoading ? <p className="mt-4 text-sm text-slate-400">Carregando...</p> : null}
        {!isLoading && !items.length ? <p className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-300">Nenhuma mídia salva ainda.</p> : null}
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <div className="flex gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-800 ring-1 ring-white/10">
                  {item.public_url ? <img src={item.public_url} alt={item.file_name} className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{item.file_name}</p>
                  <p className="text-xs text-slate-400">{item.file_type || "tipo não informado"} · {formatSize(item.file_size)} · {item.purpose || "campaign"}</p>
                  <a href={item.public_url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-sm text-cyan-200 hover:text-cyan-100">{item.public_url}</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
