"use client";

import { useState, useTransition } from "react";

const inputClass = "h-11 rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition placeholder:text-muted/70 focus:border-gold-500/50";
const labelClass = "grid gap-1.5 text-xs font-medium text-muted";

export function HomeSectionForm({ action, section }: { action: (data: FormData) => Promise<void>; section?: any }) {
  const [imageUrl, setImageUrl] = useState(section?.image_url ?? "");
  const [preview, setPreview] = useState(section?.image_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();

  const handleUpload = async (file: File) => {
    startUpload(async () => {
      setError(null);
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/admin/home-sections/upload", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Erro no upload.");
        return;
      }
      setImageUrl(data.url);
      setPreview(data.url);
    });
  };

  return (
    <form action={action} className="grid gap-3 text-sm md:grid-cols-2">
      <input type="hidden" name="id" defaultValue={section?.id ?? ""} />
      <input type="hidden" name="image_url" value={imageUrl} readOnly />

      <label className={labelClass}>Tipo
        <input name="type" defaultValue={section?.type ?? "course_highlight"} placeholder="course_highlight" className={inputClass} />
      </label>
      <label className={labelClass}>Ordem
        <input name="order_index" type="number" defaultValue={section?.order_index ?? 0} className={inputClass} />
      </label>
      <label className={`${labelClass} md:col-span-2`}>Título
        <input name="title" defaultValue={section?.title ?? ""} placeholder="Título" className={inputClass} required />
      </label>
      <label className={`${labelClass} md:col-span-2`}>Subtítulo
        <textarea name="subtitle" defaultValue={section?.subtitle ?? ""} placeholder="Subtítulo" className="min-h-24 rounded-xl border border-border bg-background px-3 py-3 text-sm text-white outline-none transition placeholder:text-muted/70 focus:border-gold-500/50" rows={3} />
      </label>
      <label className={labelClass}>Texto do botão
        <input name="button_text" defaultValue={section?.button_text ?? ""} placeholder="Texto do botão" className={inputClass} />
      </label>
      <label className={labelClass}>Link do botão
        <input name="button_link" defaultValue={section?.button_link ?? ""} placeholder="Link do botão" className={inputClass} />
      </label>

      <div className="space-y-2 rounded-2xl border border-border bg-background/55 p-3 md:col-span-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-white">Imagem do bloco</p>
            <p className="text-[11px] text-muted">Envie arquivo ou cole uma URL pública.</p>
          </div>
          <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file); }} className="block text-xs text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-gold-500/15 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gold-200" />
        </div>
        <input value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setPreview(event.target.value); }} placeholder="URL da imagem" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-white outline-none transition placeholder:text-muted/70 focus:border-gold-500/50" />
        {preview ? <img src={preview} alt="Preview" className="max-h-44 w-full rounded-xl border border-white/15 bg-black/20 object-contain sm:max-h-56" /> : null}
        {uploading ? <p className="text-xs text-cyan-200">Enviando imagem...</p> : null}
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3 text-sm text-muted md:col-span-2">
        <input name="active" type="checkbox" defaultChecked={section?.active ?? true} />
        Ativo
      </label>
      <button className="rounded-2xl border border-gold-500/30 bg-gold-500/15 px-4 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/25 md:col-span-2">Salvar bloco</button>
    </form>
  );
}
