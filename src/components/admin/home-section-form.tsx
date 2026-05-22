"use client";

import { useState, useTransition } from "react";

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

  return <form action={action} className="grid gap-3 md:grid-cols-2 text-sm"><input type="hidden" name="id" defaultValue={section?.id ?? ""} />
    <input type="hidden" name="image_url" value={imageUrl} readOnly />
    <input name="type" defaultValue={section?.type ?? "course_highlight"} placeholder="Tipo" className="rounded border border-border bg-background px-3 py-2" />
    <input name="order_index" type="number" defaultValue={section?.order_index ?? 0} className="rounded border border-border bg-background px-3 py-2" />
    <input name="title" defaultValue={section?.title ?? ""} placeholder="Título" className="rounded border border-border bg-background px-3 py-2 md:col-span-2" required />
    <textarea name="subtitle" defaultValue={section?.subtitle ?? ""} placeholder="Subtítulo" className="rounded border border-border bg-background px-3 py-2 md:col-span-2" rows={3} />
    <input name="button_text" defaultValue={section?.button_text ?? ""} placeholder="Texto do botão" className="rounded border border-border bg-background px-3 py-2" />
    <input name="button_link" defaultValue={section?.button_link ?? ""} placeholder="Link do botão" className="rounded border border-border bg-background px-3 py-2" />
    <div className="md:col-span-2 space-y-2">
      <input type="file" accept="image/*" onChange={(event)=>{ const file = event.target.files?.[0]; if (file) void handleUpload(file); }} className="block w-full text-xs" />
      <input value={imageUrl} onChange={(event)=>{setImageUrl(event.target.value); setPreview(event.target.value);}} placeholder="URL da imagem" className="w-full rounded border border-border bg-background px-3 py-2" />
      {preview ? <img src={preview} alt="Preview" className="max-h-56 w-full rounded-xl border border-white/15 object-contain bg-black/20" /> : null}
      {uploading ? <p className="text-xs text-cyan-200">Enviando imagem...</p> : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
    <label className="flex items-center gap-2 md:col-span-2"><input name="active" type="checkbox" defaultChecked={section?.active ?? true} />Ativo</label>
    <button className="rounded bg-gold-500/20 px-3 py-2 text-gold-200 md:col-span-2">Salvar bloco</button>
  </form>;
}
