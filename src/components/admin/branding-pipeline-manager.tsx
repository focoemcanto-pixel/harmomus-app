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

function drawAsset(image: HTMLImageElement, asset: GeneratedAsset) {
  const canvas = document.createElement("canvas");
  canvas.width = asset.width;
  canvas.height = asset.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível no navegador.");

  ctx.clearRect(0, 0, asset.width, asset.height);

  const scale = asset.fit === "cover"
    ? Math.max(asset.width / image.width, asset.height / image.height)
    : Math.min(asset.width / image.width, asset.height / image.height);

  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = (asset.width - drawWidth) / 2;
  const drawY = (asset.height - drawHeight) / 2;

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

  if (!response.ok) {
    throw new Error(data?.error || `Falha ao enviar ${asset.label}.`);
  }

  return data.url as string;
}

export function BrandingPipelineManager({ initial }: { initial: BrandingState }) {
  const [values, setValues] = useState<BrandingState>(initial);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(() => ASSETS.map((asset) => ({ ...asset, url: values[asset.field] })), [values]);

  async function processImage(file: File) {
    try {
      setLoading(true);
      setError(null);
      setMessage("Gerando versões otimizadas...");

      const image = await loadImage(file);
      const nextValues = { ...values };

      for (const asset of ASSETS) {
        setMessage(`Gerando ${asset.label} (${asset.width}x${asset.height})...`);
        const canvas = drawAsset(image, asset);
        const blob = await canvasToBlob(canvas, asset.mimeType, asset.quality);
        setMessage(`Enviando ${asset.label}...`);
        nextValues[asset.field] = await uploadGeneratedAsset(asset, blob);
      }

      setValues(nextValues);
      setMessage("Pipeline concluído. Agora clique em Salvar configurações para gravar tudo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar identidade visual.");
      setMessage(null);
    } finally {
      setLoading(false);
    }
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
            Suba uma única imagem em boa qualidade. O Harmomus gera automaticamente logo, favicon, imagem de login, hero/banner e Open Graph nos tamanhos corretos.
          </p>
        </div>
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
              if (file) void processImage(file);
            }}
          />
        </label>
      </div>

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
          </div>
        ))}
      </div>
    </div>
  );
}
