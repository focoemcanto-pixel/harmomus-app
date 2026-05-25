"use client";

import { useMemo, useState } from "react";

type BrandingAssetKey = "logo" | "favicon" | "login" | "hero" | "og";

type BrandingState = {
  logoUrl: string;
  faviconUrl: string;
  loginImageUrl: string;
  heroImageUrl: string;
  ogImageUrl: string;
};

type CropState = { zoom: number; x: number; y: number };

type GeneratedAsset = {
  key: BrandingAssetKey;
  label: string;
  width: number;
  height: number;
  field: keyof BrandingState;
  mimeType: "image/webp" | "image/png";
  fit: "cover" | "contain";
  quality?: number;
};

const ASSETS: GeneratedAsset[] = [
  { key: "logo", label: "Logo principal", width: 1200, height: 360, field: "logoUrl", mimeType: "image/webp", fit: "contain", quality: 0.92 },
  { key: "favicon", label: "Favicon", width: 512, height: 512, field: "faviconUrl", mimeType: "image/png", fit: "contain" },
  { key: "login", label: "Imagem login", width: 1200, height: 1600, field: "loginImageUrl", mimeType: "image/webp", fit: "cover", quality: 0.9 },
  { key: "hero", label: "Hero/banner", width: 1920, height: 900, field: "heroImageUrl", mimeType: "image/webp", fit: "cover", quality: 0.9 },
  { key: "og", label: "Open Graph", width: 1200, height: 630, field: "ogImageUrl", mimeType: "image/webp", fit: "cover", quality: 0.9 },
];

const DEFAULT_CROPS: Record<BrandingAssetKey, CropState> = {
  logo: { zoom: 1, x: 0, y: 0 },
  favicon: { zoom: 1, x: 0, y: 0 },
  login: { zoom: 1, x: 0, y: 0 },
  hero: { zoom: 1, x: 0, y: 0 },
  og: { zoom: 1, x: 0, y: 0 },
};

const EMPTY_VALUES: BrandingState = {
  logoUrl: "",
  faviconUrl: "",
  loginImageUrl: "",
  heroImageUrl: "",
  ogImageUrl: "",
};

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível abrir este upload para edição. Use 'Upload específico' para substituir."));
    image.src = url;
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível carregar a imagem."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Falha ao gerar imagem otimizada."));
      else resolve(blob);
    }, mimeType, quality);
  });
}

function drawAsset(image: HTMLImageElement, asset: GeneratedAsset, crop: CropState) {
  const canvas = document.createElement("canvas");
  canvas.width = asset.width;
  canvas.height = asset.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível no navegador.");

  ctx.clearRect(0, 0, asset.width, asset.height);

  const baseScale = asset.fit === "cover"
    ? Math.max(asset.width / image.width, asset.height / image.height)
    : Math.min(asset.width / image.width, asset.height / image.height);

  const scale = baseScale * crop.zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = (asset.width - drawWidth) / 2 + crop.x * asset.width;
  const drawY = (asset.height - drawHeight) / 2 + crop.y * asset.height;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return canvas;
}

async function uploadGeneratedAsset(asset: GeneratedAsset, blob: Blob) {
  const form = new FormData();
  const extension = asset.mimeType === "image/png" ? "png" : "webp";
  form.append("asset", asset.key);
  form.append("file", new File([blob], `${asset.key}.${extension}`, { type: asset.mimeType }));

  const response = await fetch("/api/admin/branding-upload", { method: "POST", body: form });
  const data = await response.json();

  if (!response.ok) throw new Error(data?.error || `Falha ao enviar ${asset.label}.`);
  return data.url as string;
}

export function BrandingPipelineManager({ initial }: { initial: BrandingState }) {
  const [values, setValues] = useState<BrandingState>(initial);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string>("");
  const [selectedAssetKey, setSelectedAssetKey] = useState<BrandingAssetKey>("hero");
  const [crops, setCrops] = useState<Record<BrandingAssetKey, CropState>>(DEFAULT_CROPS);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAsset = ASSETS.find((asset) => asset.key === selectedAssetKey) ?? ASSETS[0];
  const selectedCrop = crops[selectedAssetKey];
  const previews = useMemo(() => ASSETS.map((asset) => ({ ...asset, url: values[asset.field] })), [values]);

  async function generateAssets(file: File, onlyAsset?: GeneratedAsset) {
    try {
      setLoading(true);
      setError(null);
      setMessage("Gerando versões otimizadas...");

      const image = await loadImage(file);
      const nextValues = { ...values };
      const targets = onlyAsset ? [onlyAsset] : ASSETS;

      for (const asset of targets) {
        setMessage(`Gerando ${asset.label} (${asset.width}x${asset.height})...`);
        const canvas = drawAsset(image, asset, crops[asset.key]);
        const blob = await canvasToBlob(canvas, asset.mimeType, asset.quality);
        setMessage(`Enviando ${asset.label}...`);
        const url = await uploadGeneratedAsset(asset, blob);
        nextValues[asset.field] = url;
      }

      setValues(nextValues);
      setMessage(onlyAsset ? `${onlyAsset.label} atualizado. Agora clique em Salvar configurações.` : "Pipeline concluído. Agora clique em Salvar configurações.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar identidade visual.");
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }

  async function editSavedAsset(asset: GeneratedAsset) {
    const url = values[asset.field];
    if (!url) return;

    try {
      setLoading(true);
      setError(null);
      setMessage(`Abrindo ${asset.label} salvo para edição...`);
      await loadImageFromUrl(url);
      if (sourcePreview && sourcePreview.startsWith("blob:")) URL.revokeObjectURL(sourcePreview);
      setSourceFile(null);
      setSourcePreview(url);
      setSelectedAssetKey(asset.key);
      setCrops((current) => ({ ...current, [asset.key]: DEFAULT_CROPS[asset.key] }));
      setMessage(`${asset.label} aberto no editor. Ajuste o enquadramento e clique em Regerar este formato.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o upload salvo para edição.");
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }

  function handleMatrixFile(file: File) {
    if (sourcePreview && sourcePreview.startsWith("blob:")) URL.revokeObjectURL(sourcePreview);
    setSourceFile(file);
    setSourcePreview(URL.createObjectURL(file));
    void generateAssets(file);
  }

  async function handleSpecificFile(asset: GeneratedAsset, file: File) {
    try {
      setLoading(true);
      setError(null);
      setMessage(`Enviando ${asset.label} personalizado...`);
      const url = await uploadGeneratedAsset(asset, file);
      const nextValues = { ...values, [asset.field]: url };
      setValues(nextValues);
      setMessage(`${asset.label} enviado. Agora clique em Salvar configurações.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar imagem específica.");
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateSelectedFromPreview() {
    if (!sourcePreview) return;
    try {
      setLoading(true);
      setError(null);
      setMessage(`Regerando ${selectedAsset.label}...`);
      const image = sourceFile ? await loadImage(sourceFile) : await loadImageFromUrl(sourcePreview);
      const canvas = drawAsset(image, selectedAsset, selectedCrop);
      const blob = await canvasToBlob(canvas, selectedAsset.mimeType, selectedAsset.quality);
      const url = await uploadGeneratedAsset(selectedAsset, blob);
      setValues((current) => ({ ...current, [selectedAsset.field]: url }));
      setMessage(`${selectedAsset.label} atualizado. Clique em Salvar configurações para publicar.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao regerar imagem.");
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }

  function clearAsset(asset: GeneratedAsset) {
    setValues((current) => ({ ...current, [asset.field]: "" }));
    setMessage(`${asset.label} removido. Clique em Salvar configurações para publicar o padrão novamente.`);
    setError(null);
  }

  function clearAllAssets() {
    setValues(EMPTY_VALUES);
    setSourceFile(null);
    if (sourcePreview && sourcePreview.startsWith("blob:")) URL.revokeObjectURL(sourcePreview);
    setSourcePreview("");
    setCrops(DEFAULT_CROPS);
    setMessage("Todos os uploads de identidade foram removidos. Clique em Salvar configurações para voltar ao padrão original.");
    setError(null);
  }

  function updateCrop(partial: Partial<CropState>) {
    setCrops((current) => ({
      ...current,
      [selectedAssetKey]: { ...current[selectedAssetKey], ...partial },
    }));
  }

  return (
    <div className="md:col-span-2 rounded-2xl border border-border bg-background/60 p-5">
      <input type="hidden" name="logoUrl" value={values.logoUrl} />
      <input type="hidden" name="faviconUrl" value={values.faviconUrl} />
      <input type="hidden" name="loginImageUrl" value={values.loginImageUrl} />
      <input type="hidden" name="heroImageUrl" value={values.heroImageUrl} />
      <input type="hidden" name="ogImageUrl" value={values.ogImageUrl} />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold-300">Pipeline inteligente de identidade</p>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Suba uma imagem matriz, envie uma imagem específica ou edite um upload já salvo. Depois clique em Salvar configurações para publicar.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="inline-flex cursor-pointer rounded-xl border border-gold-300/30 bg-gold-500/15 px-4 py-2 text-sm font-semibold text-gold-200 hover:bg-gold-500/25">
            {loading ? "Processando..." : "Subir imagem matriz"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={loading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) handleMatrixFile(file);
              }}
            />
          </label>
          <button type="button" onClick={clearAllAssets} disabled={loading} className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50">
            Remover tudo
          </button>
        </div>
      </div>

      {sourcePreview ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="rounded-2xl border border-border bg-black/30 p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {ASSETS.map((asset) => (
                <button key={asset.key} type="button" onClick={() => setSelectedAssetKey(asset.key)} className={`rounded-full border px-3 py-1 text-xs ${asset.key === selectedAssetKey ? "border-gold-300 bg-gold-500/20 text-gold-100" : "border-white/10 bg-white/5 text-zinc-300"}`}>
                  {asset.label}
                </button>
              ))}
            </div>
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(45deg,#111_25%,transparent_25%),linear-gradient(-45deg,#111_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111_75%),linear-gradient(-45deg,transparent_75%,#111_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0]" style={{ aspectRatio: `${selectedAsset.width}/${selectedAsset.height}` }}>
              <img
                src={sourcePreview}
                alt="Prévia de enquadramento"
                className="h-full w-full object-contain"
                style={{ transform: `translate(${selectedCrop.x * 100}%, ${selectedCrop.y * 100}%) scale(${selectedCrop.zoom})`, transformOrigin: "center" }}
              />
              <div className="pointer-events-none absolute inset-0 border-2 border-gold-300/40" />
            </div>
            <p className="mt-3 text-xs text-muted">Editor visual: {selectedAsset.label} • {selectedAsset.width}x{selectedAsset.height}. A prévia mostra a imagem carregada para você ajustar e regerar.</p>
          </div>

          <div className="rounded-2xl border border-border bg-black/30 p-4">
            <p className="text-sm font-semibold text-white">Ajustar enquadramento</p>
            <label className="mt-4 block text-xs text-zinc-300">Zoom: {selectedCrop.zoom.toFixed(2)}x</label>
            <input type="range" min="0.2" max="3.5" step="0.05" value={selectedCrop.zoom} onChange={(e) => updateCrop({ zoom: Number(e.target.value) })} className="mt-2 w-full" />
            <label className="mt-4 block text-xs text-zinc-300">Horizontal</label>
            <input type="range" min="-1" max="1" step="0.01" value={selectedCrop.x} onChange={(e) => updateCrop({ x: Number(e.target.value) })} className="mt-2 w-full" />
            <label className="mt-4 block text-xs text-zinc-300">Vertical</label>
            <input type="range" min="-1" max="1" step="0.01" value={selectedCrop.y} onChange={(e) => updateCrop({ y: Number(e.target.value) })} className="mt-2 w-full" />
            <div className="mt-5 grid gap-2">
              <button type="button" disabled={!sourcePreview || loading} onClick={() => void regenerateSelectedFromPreview()} className="rounded-xl bg-gold-500/20 px-4 py-2 text-sm font-semibold text-gold-200 disabled:opacity-50">Regerar este formato</button>
              <button type="button" disabled={!sourceFile || loading} onClick={() => sourceFile && generateAssets(sourceFile)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 disabled:opacity-50">Regerar todos</button>
              <button type="button" onClick={() => updateCrop(DEFAULT_CROPS[selectedAssetKey])} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200">Resetar enquadramento</button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {previews.map((asset) => (
          <div key={asset.key} className="rounded-2xl border border-border bg-black/30 p-3">
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2">
              {asset.url ? <img src={asset.url} alt={asset.label} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">Sem imagem</span>}
            </div>
            <p className="mt-2 text-xs font-semibold text-white">{asset.label}</p>
            <p className="text-[11px] text-muted">{asset.width}x{asset.height}</p>
            <button type="button" onClick={() => void editSavedAsset(asset)} disabled={loading || !asset.url} className="mt-3 w-full rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
              Editar upload salvo
            </button>
            <label className="mt-2 block cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-[11px] font-semibold text-zinc-200 hover:bg-white/10">
              Upload específico
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={loading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void handleSpecificFile(asset, file);
                }}
              />
            </label>
            <button type="button" onClick={() => clearAsset(asset)} disabled={loading || !asset.url} className="mt-2 w-full rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40">
              Remover upload
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
