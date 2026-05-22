"use client";

import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import type { Category, Kit, Plan } from "@/lib/data/kits";

interface KitFormProps {
  mode: "create" | "edit";
  categories: Category[];
  plans: Plan[];
  initialData?: Kit | null;
  action: (formData: FormData) => Promise<void>;
}

type UploadStatus = "idle" | "uploading" | "success" | "error";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-5 py-2.5 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Salvando..." : mode === "create" ? "Criar kit" : "Salvar alterações"}
    </button>
  );
}

export function KitForm({ mode, categories, plans, initialData, action }: KitFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initialData?.slug));
  const [coverUrl, setCoverUrl] = useState(initialData?.cover_url ?? "");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const preview = useMemo(() => coverUrl.trim() || "https://placehold.co/800x500/101114/f4f4f5?text=Sem+capa", [coverUrl]);

  const uploadLabel =
    uploadStatus === "uploading" ? "Enviando capa..." : uploadStatus === "success" ? "Upload concluído" : "Selecionar imagem";

  async function performUpload(file: File) {
    if (!slug.trim()) {
      setUploadStatus("error");
      setUploadError("Preencha o slug antes de enviar a capa.");
      return;
    }

    setUploadStatus("uploading");
    setUploadError(null);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("slug", slug);

      const response = await fetch("/api/upload", { method: "POST", body });
      const data = await response.json();

      if (!response.ok || !data?.url) {
        throw new Error(data?.error || "Falha ao enviar imagem.");
      }

      setCoverUrl(String(data.url));
      setUploadStatus("success");
    } catch (error) {
      setUploadStatus("error");
      setUploadError(error instanceof Error ? error.message : "Erro inesperado no upload.");
    }
  }

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-surface p-6 shadow-premium">
      <input type="hidden" name="cover_url" value={coverUrl} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-muted">Nome *</span>
          <input
            required
            name="name"
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              if (!slugTouched) setSlug(slugify(next));
            }}
            className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-foreground outline-none ring-gold-400/40 focus:ring"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Slug *</span>
          <input
            required
            name="slug"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
            className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-foreground outline-none ring-gold-400/40 focus:ring"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Artista *</span>
          <input required name="artist" defaultValue={initialData?.artist ?? ""} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Categoria</span>
          <select name="category_id" defaultValue={initialData?.category_id ?? ""} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2">
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="text-muted">Descrição</span>
          <textarea name="description" defaultValue={initialData?.description ?? ""} rows={4} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
        </label>
        <label className="space-y-2 text-sm md:col-span-2">
          <span className="text-muted">Letra</span>
          <textarea name="lyrics" defaultValue={initialData?.lyrics ?? ""} rows={8} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="text-muted">Letra</span>
          <textarea name="lyrics" defaultValue={initialData?.lyrics ?? ""} rows={8} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
        </label>

        <div className="space-y-2 text-sm md:col-span-2">
          <span className="text-muted">Capa do kit</span>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOver(false);
              const droppedFile = event.dataTransfer.files?.[0];
              if (droppedFile) void performUpload(droppedFile);
            }}
            className={`rounded-xl border border-dashed p-6 text-center transition ${
              isDragOver ? "border-gold-400 bg-gold-500/10" : "border-border bg-surface-muted"
            }`}
          >
            <p className="text-sm text-muted">Arraste e solte sua imagem aqui</p>
            <p className="mt-1 text-xs text-muted">Apenas imagens, até 5MB.</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadStatus === "uploading"}
              className="mt-4 rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploadLabel}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0];
                if (selectedFile) void performUpload(selectedFile);
              }}
            />
          </div>
          {uploadStatus === "success" ? <p className="text-xs text-emerald-400">Imagem enviada com sucesso.</p> : null}
          {uploadStatus === "error" && uploadError ? <p className="text-xs text-red-400">{uploadError}</p> : null}
          <img src={preview} alt="Preview da capa" className="mt-2 h-44 w-full rounded-lg border border-border object-cover" />
        </div>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Pasta R2</span>
          <input name="r2_folder" defaultValue={initialData?.r2_folder ?? ""} placeholder="images/kits/grandioso-es-tu" className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Plano necessário</span>
          <select name="required_plan" defaultValue={initialData?.required_plan ?? ""} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2">
            <option value="">Todos os planos</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.slug}>{plan.name}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-muted md:col-span-2">
          <input name="published" type="checkbox" defaultChecked={initialData?.published ?? false} className="h-4 w-4 rounded border-border bg-surface-muted" />
          Publicado
        </label>
      </div>

      <SubmitButton mode={mode} />
    </form>
  );
}
