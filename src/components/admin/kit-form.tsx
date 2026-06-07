"use client";

import { type ChangeEvent, type PointerEvent, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { ManualTessituraFields } from "@/components/admin/manual-tessitura-fields";
import type { Category, Kit, Plan } from "@/lib/data/kits";

interface KitFormProps {
  mode: "create" | "edit";
  categories: Category[];
  artistCategories: Category[];
  plans: Plan[];
  initialData?: Kit | null;
  action: (formData: FormData) => Promise<void>;
}

type UploadStatus = "idle" | "uploading" | "success" | "error";
type CropState = { x: number; y: number; zoom: number };

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const CROP_SIZE = 512;
const DEFAULT_ALLOWED_PLANS = ["free", "plus", "premium"];

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

function resolveInitialAllowedPlans(initialData?: Kit | null) {
  const explicit = (initialData as (Kit & { allowed_plan_slugs?: string[] | null }) | null | undefined)?.allowed_plan_slugs;
  if (Array.isArray(explicit) && explicit.length) return explicit;
  if (initialData?.required_plan === "premium") return ["premium"];
  if (initialData?.required_plan === "plus") return ["plus", "premium"];
  return DEFAULT_ALLOWED_PLANS;
}

function planHelperText(slug: string) {
  if (slug === "free") return "Inclui o kit no catálogo gratuito, respeitando limite diário.";
  if (slug === "plus") return "Libera o kit para assinantes Plus sem limite diário.";
  if (slug === "premium") return "Libera o kit para Premium e recursos avançados.";
  return "Libera o kit para este plano.";
}

export function KitForm({ mode, categories, artistCategories, plans, initialData, action }: KitFormProps) {
  const toneInitialData = initialData as (Kit & {
    original_tone?: string | null;
    default_tone?: string | null;
    allow_pitch_shift?: boolean | null;
    max_pitch_shift_semitones?: number | null;
    manual_tessitura_ranges?: unknown;
  }) | null | undefined;

  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initialData?.slug));
  const [coverUrl, setCoverUrl] = useState(initialData?.cover_url ?? "");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [cropState, setCropState] = useState<CropState>({ x: 0, y: 0, zoom: 1 });
  const [sourceImageElement, setSourceImageElement] = useState<HTMLImageElement | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [showCoverAsCircle, setShowCoverAsCircle] = useState(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropAreaRef = useRef<HTMLDivElement | null>(null);

  const selectedAllowedPlans = useMemo(() => new Set(resolveInitialAllowedPlans(initialData)), [initialData]);
  const orderedPlans = useMemo(() => [...plans].sort((a, b) => (a.hierarchy_level ?? 0) - (b.hierarchy_level ?? 0)), [plans]);
  const preview = useMemo(() => coverUrl.trim() || "https://placehold.co/800x800/101114/f4f4f5?text=Sem+capa", [coverUrl]);
  const uploadLabel = uploadStatus === "uploading" ? "Enviando capa..." : uploadStatus === "success" ? "Upload concluído" : "Selecionar imagem";

  async function performUpload(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      setUploadStatus("error");
      setUploadError("A imagem deve ter no máximo 5MB.");
      return;
    }
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
      if (!response.ok || !data?.url) throw new Error(data?.error || "Falha ao enviar imagem.");
      setCoverUrl(String(data.url));
      setUploadStatus("success");
    } catch (error) {
      setUploadStatus("error");
      setUploadError(error instanceof Error ? error.message : "Erro inesperado no upload.");
    }
  }

  async function openCropper(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      setUploadStatus("error");
      setUploadError("A imagem deve ter no máximo 5MB.");
      return;
    }
    setUploadStatus("idle");
    setUploadError(null);
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setSourceImageElement(image);
      setSourceImageUrl(objectUrl);
      setCropState({ x: 0, y: 0, zoom: 1 });
      setIsCropModalOpen(true);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setUploadStatus("error");
      setUploadError("Não foi possível abrir esta imagem.");
    };
    image.src = objectUrl;
  }

  function closeCropper() {
    setIsCropModalOpen(false);
    if (sourceImageUrl) URL.revokeObjectURL(sourceImageUrl);
    setSourceImageUrl(null);
    setSourceImageElement(null);
    setIsDraggingCrop(false);
    dragStartRef.current = null;
  }

  async function applyCrop() {
    if (!sourceImageElement) return;
    const canvas = document.createElement("canvas");
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const context = canvas.getContext("2d");
    if (!context) {
      setUploadStatus("error");
      setUploadError("Seu navegador não suporta edição desta imagem.");
      return;
    }
    const minDimension = Math.min(sourceImageElement.naturalWidth, sourceImageElement.naturalHeight);
    const cropWidth = minDimension / cropState.zoom;
    const cropHeight = minDimension / cropState.zoom;
    const offsetX = ((cropState.x / 100) * cropWidth) / 2;
    const offsetY = ((cropState.y / 100) * cropHeight) / 2;
    const centerX = sourceImageElement.naturalWidth / 2 + offsetX;
    const centerY = sourceImageElement.naturalHeight / 2 + offsetY;
    const sx = Math.max(0, Math.min(sourceImageElement.naturalWidth - cropWidth, centerX - cropWidth / 2));
    const sy = Math.max(0, Math.min(sourceImageElement.naturalHeight - cropHeight, centerY - cropHeight / 2));
    context.drawImage(sourceImageElement, sx, sy, cropWidth, cropHeight, 0, 0, CROP_SIZE, CROP_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/webp", 0.92));
    if (!blob) {
      setUploadStatus("error");
      setUploadError("Não foi possível gerar a capa recortada.");
      return;
    }
    closeCropper();
    await performUpload(new File([blob], "cover.webp", { type: "image/webp" }));
  }

  function onCropPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { clientX: event.clientX, clientY: event.clientY, startX: cropState.x, startY: cropState.y };
    setIsDraggingCrop(true);
  }

  function onCropPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDraggingCrop || !dragStartRef.current) return;
    const deltaX = event.clientX - dragStartRef.current.clientX;
    const deltaY = event.clientY - dragStartRef.current.clientY;
    const areaWidth = cropAreaRef.current?.clientWidth ?? 1;
    const areaHeight = cropAreaRef.current?.clientHeight ?? 1;
    const maxOffset = Math.max(0, ((cropState.zoom - 1) * 100) / cropState.zoom);
    const nextX = dragStartRef.current.startX + (deltaX / areaWidth) * 100;
    const nextY = dragStartRef.current.startY + (deltaY / areaHeight) * 100;
    setCropState((previous) => ({ ...previous, x: Math.max(-maxOffset, Math.min(maxOffset, nextX)), y: Math.max(-maxOffset, Math.min(maxOffset, nextY)) }));
  }

  function onCropPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setIsDraggingCrop(false);
    dragStartRef.current = null;
  }

  function onSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (selectedFile) void openCropper(selectedFile);
  }

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-surface p-6 shadow-premium">
      <input type="hidden" name="cover_url" value={coverUrl} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-muted">Nome *</span>
          <input required name="name" value={name} onChange={(event) => { const next = event.target.value; setName(next); if (!slugTouched) setSlug(slugify(next)); }} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-foreground outline-none ring-gold-400/40 focus:ring" />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Slug *</span>
          <input required name="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-foreground outline-none ring-gold-400/40 focus:ring" />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Artista *</span>
          <input list="artist-suggestions" required name="artist" defaultValue={initialData?.artist ?? ""} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
          <datalist id="artist-suggestions">{artistCategories.map((category) => <option key={category.id} value={category.name} />)}</datalist>
          <p className="text-xs text-amber-300">Novo artista será criado automaticamente.</p>
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Categoria (opcional/avançado)</span>
          <select name="category_id" defaultValue={initialData?.category_id ?? ""} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2">
            <option value="">Sem categoria</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
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

        <div className="space-y-2 text-sm md:col-span-2">
          <span className="text-muted">Capa do kit</span>
          <div onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={(event) => { event.preventDefault(); setIsDragOver(false); const droppedFile = event.dataTransfer.files?.[0]; if (droppedFile) void openCropper(droppedFile); }} className={`rounded-xl border border-dashed p-6 text-center transition ${isDragOver ? "border-gold-400 bg-gold-500/10" : "border-border bg-surface-muted"}`}>
            <p className="text-sm text-muted">Arraste e solte sua imagem aqui</p>
            <p className="mt-1 text-xs text-muted">Apenas imagens, até 5MB. Recorte 1:1 antes do upload.</p>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadStatus === "uploading"} className="mt-4 rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60">{uploadLabel}</button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onSelectFile} />
          </div>
          {uploadStatus === "success" ? <p className="text-xs text-emerald-400">Imagem enviada com sucesso.</p> : null}
          {uploadStatus === "error" && uploadError ? <p className="text-xs text-red-400">{uploadError}</p> : null}
          <div className="mt-3 flex items-center gap-3">
            <img src={preview} alt="Preview da capa" className={`aspect-square w-full max-w-64 border border-border object-cover shadow-lg ${showCoverAsCircle ? "rounded-full" : "rounded-2xl"}`} />
            <button type="button" onClick={() => setShowCoverAsCircle((value) => !value)} className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-muted hover:text-foreground">{showCoverAsCircle ? "Preview quadrado" : "Preview circular"}</button>
          </div>
        </div>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="text-muted">Pasta R2</span>
          <input name="r2_folder" defaultValue={initialData?.r2_folder ?? ""} placeholder="images/kits/grandioso-es-tu" className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
        </label>

        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 md:col-span-2">
          <div className="mb-4">
            <p className="text-sm font-medium text-cyan-100">Disponibilidade por plano</p>
            <p className="mt-1 text-xs text-muted">Escolha exatamente quais planos podem abrir este kit. Usuários sem acesso verão uma chamada para upgrade.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {orderedPlans.map((plan) => (
              <label key={plan.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface-muted p-4 transition hover:border-cyan-300/50 hover:bg-cyan-400/5">
                <input name="allowed_plan_slugs" type="checkbox" value={plan.slug} defaultChecked={selectedAllowedPlans.has(plan.slug)} className="mt-1 h-4 w-4 rounded border-border bg-surface-muted accent-cyan-300" />
                <span>
                  <span className="block text-sm font-semibold text-foreground">{plan.name}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">{planHelperText(plan.slug)}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-amber-200">Dica: para kit exclusivo, deixe marcado apenas Plus/Premium ou apenas Premium.</p>
        </div>

        <ManualTessituraFields ranges={toneInitialData?.manual_tessitura_ranges} />

        <div className="rounded-xl border border-gold-500/20 bg-gold-500/5 p-4 md:col-span-2">
          <div className="mb-4">
            <p className="text-sm font-medium text-gold-200">Configuração vocal inteligente</p>
            <p className="mt-1 text-xs text-muted">Esses campos definem o tom que abre o player e preparam o kit para modulação/tessitura.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted">Tom original do arranjo</span>
              <input name="original_tone" defaultValue={toneInitialData?.original_tone ?? ""} placeholder="Ex: C, D#, Bb" className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
              <p className="text-xs text-muted">Referência oficial do arranjo e da tessitura.</p>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted">Tom inicial do player</span>
              <input name="default_tone" defaultValue={toneInitialData?.default_tone ?? toneInitialData?.original_tone ?? ""} placeholder="Ex: C" className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
              <p className="text-xs text-muted">No Free, esse é o tom que abre e permanece disponível.</p>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input name="allow_pitch_shift" type="checkbox" defaultChecked={toneInitialData?.allow_pitch_shift ?? true} className="h-4 w-4 rounded border-border bg-surface-muted" />
              Permitir modulação inteligente
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted">Limite de modulação</span>
              <select name="max_pitch_shift_semitones" defaultValue={String(toneInitialData?.max_pitch_shift_semitones ?? 2)} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2">
                <option value="1">±1 semitom</option>
                <option value="2">±2 semitons</option>
                <option value="3">±3 semitons</option>
              </select>
            </label>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted md:col-span-2">
          <input name="published" type="checkbox" defaultChecked={initialData?.published ?? false} className="h-4 w-4 rounded border-border bg-surface-muted" />
          Publicado
        </label>
      </div>

      <SubmitButton mode={mode} />

      {isCropModalOpen && sourceImageUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-zinc-100">Recortar capa do kit</h3>
            <p className="mt-1 text-xs text-zinc-400">Ajuste zoom e posição para gerar uma capa quadrada premium (1:1).</p>
            <div ref={cropAreaRef} onPointerDown={onCropPointerDown} onPointerMove={onCropPointerMove} onPointerUp={onCropPointerUp} onPointerCancel={onCropPointerUp} className="relative mt-4 aspect-square w-full overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 touch-none">
              <img src={sourceImageUrl} alt="Prévia de recorte" draggable={false} className="h-full w-full select-none object-cover" style={{ transform: `translate(${cropState.x}%, ${cropState.y}%) scale(${cropState.zoom})`, transformOrigin: "center", cursor: isDraggingCrop ? "grabbing" : "grab" }} />
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-gold-400/80" />
            </div>
            <label className="mt-4 block text-xs text-zinc-400">
              Zoom
              <input type="range" min={1} max={3} step={0.01} value={cropState.zoom} onChange={(event) => setCropState((previous) => ({ ...previous, zoom: Number(event.target.value) }))} className="mt-2 w-full accent-gold-400" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeCropper} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900">Cancelar</button>
              <button type="button" onClick={() => void applyCrop()} className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 hover:bg-gold-500/20">Aplicar corte</button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
