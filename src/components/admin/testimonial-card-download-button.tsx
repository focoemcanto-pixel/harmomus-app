"use client";

import { useState } from "react";
import { Download } from "lucide-react";

interface TestimonialCardDownloadButtonProps {
  filename: string;
}

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const CSS_URL_PATTERN = /url\((['"]?)(.*?)\1\)/g;

function isDataUrl(src: string) {
  return src.startsWith("data:");
}

function isBlobUrl(src: string) {
  return src.startsWith("blob:");
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao converter imagem."));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(src: string) {
  if (!src || isDataUrl(src)) return src;

  const fetchUrl = isBlobUrl(src) ? src : proxiedImageUrl(src);
  let response = await fetch(fetchUrl, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
  });

  if (!response.ok && fetchUrl !== src) {
    response = await fetch(src, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
    });
  }

  if (!response.ok) {
    throw new Error(`Imagem retornou HTTP ${response.status}.`);
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream") {
    throw new Error("Arquivo remoto não é uma imagem.");
  }

  return blobToDataUrl(blob);
}

function waitForImageDecode(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Falha ao carregar imagem do card."));
  }).then(async () => {
    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        // Safari can reject decode() for images that are already usable on canvas.
      }
    }
  });
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar o gerador de imagem."));
    document.body.appendChild(script);
  });
}

function getExportSize(filename: string) {
  return filename.includes("story") ? { width: 1080, height: 1920 } : { width: 1080, height: 1080 };
}

function normalizeClassName(className: string) {
  return className
    .replace(/scale-\[[^\]]+\]/g, "")
    .replace(/origin-top/g, "")
    .replace(/print:[^\s]+/g, "")
    .replace(/backdrop-blur[^\s]*/g, "")
    .replace(/blur-3xl/g, "")
    .replace(/blur-2xl/g, "")
    .replace(/blur-xl/g, "")
    .replace(/blur-lg/g, "")
    .replace(/blur-md/g, "")
    .replace(/blur-sm/g, "")
    .replace(/blur/g, "")
    .replace(/shadow-\[[^\]]+\]/g, "")
    .replace(/-translate-x-1\/2/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCloneForExport(clone: HTMLElement) {
  const elements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement | SVGElement>("*"))];

  elements.forEach((element) => {
    if (element instanceof HTMLElement) {
      element.className = normalizeClassName(String(element.className || ""));
    }

    const style = element instanceof HTMLElement || element instanceof SVGElement ? element.style : null;
    if (!style) return;

    style.transform = "none";
    style.filter = "none";
    style.backdropFilter = "none";
    style.setProperty("-webkit-backdrop-filter", "none");
    style.boxShadow = "none";
    style.textShadow = "none";
  });

  clone.style.isolation = "isolate";
}

function prepareCloneForExport(source: HTMLElement, width: number, height: number) {
  const host = document.createElement("div");
  host.setAttribute("data-testimonial-export-host", "true");
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.overflow = "hidden";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  host.style.background = "#030712";
  host.style.opacity = "0";

  const clone = source.cloneNode(true) as HTMLElement;
  sanitizeCloneForExport(clone);

  clone.style.transform = "none";
  clone.style.transformOrigin = "top left";
  clone.style.position = "relative";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.minWidth = `${width}px`;
  clone.style.minHeight = `${height}px`;
  clone.style.maxWidth = `${width}px`;
  clone.style.maxHeight = `${height}px`;
  clone.style.margin = "0";
  clone.style.opacity = "1";
  clone.style.visibility = "visible";

  host.appendChild(clone);
  document.body.appendChild(host);

  return { host, clone };
}

function proxiedImageUrl(src: string) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src;
  const absolute = new URL(src, window.location.href);
  if (absolute.origin === window.location.origin && !absolute.pathname.startsWith("/_next/image")) return absolute.toString();
  return `/api/admin/image-proxy?url=${encodeURIComponent(absolute.toString())}`;
}

async function inlineCssBackgroundImages(node: HTMLElement) {
  const elements = [node, ...Array.from(node.querySelectorAll<HTMLElement>("*"))];

  await Promise.all(
    elements.map(async (element) => {
      const backgroundImage = element.style.backgroundImage;
      if (!backgroundImage || !backgroundImage.includes("url(")) return;

      const replacements = await Promise.all(
        Array.from(backgroundImage.matchAll(CSS_URL_PATTERN)).map(async ([fullMatch, , rawUrl]) => {
          const url = rawUrl.trim();
          if (!url || isDataUrl(url)) return { fullMatch, replacement: fullMatch };

          try {
            const dataUrl = await fetchImageAsDataUrl(url);
            return { fullMatch, replacement: `url("${dataUrl}")` };
          } catch (error) {
            console.warn("[testimonial-card] background image inline failed", { url, error });
            return { fullMatch, replacement: `url("${TRANSPARENT_PIXEL}")` };
          }
        }),
      );

      element.style.backgroundImage = replacements.reduce(
        (value, { fullMatch, replacement }) => value.replace(fullMatch, replacement),
        backgroundImage,
      );
    }),
  );
}

async function inlineImagesAsDataUrls(node: HTMLElement) {
  await Promise.all(
    Array.from(node.querySelectorAll("img")).map(async (image) => {
      const originalSrc = image.currentSrc || image.src || image.getAttribute("src") || "";
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.removeAttribute("loading");
      image.crossOrigin = "anonymous";

      if (!originalSrc) return;

      try {
        const dataUrl = await fetchImageAsDataUrl(originalSrc);
        image.src = dataUrl;
        image.setAttribute("src", dataUrl);
        await waitForImageDecode(image);
      } catch (error) {
        console.warn("[testimonial-card] image inline failed", { src: originalSrc, error });
        image.src = TRANSPARENT_PIXEL;
        image.setAttribute("src", TRANSPARENT_PIXEL);
        await waitForImageDecode(image);
      }
    }),
  );
}

async function inlineAllImagesForExport(node: HTMLElement) {
  await inlineImagesAsDataUrls(node);
  await inlineCssBackgroundImages(node);
}

async function triggerDownload(dataUrl: string, filename: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  try {
    link.download = filename;
    link.href = objectUrl;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }
}

export function TestimonialCardDownloadButton({ filename }: TestimonialCardDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setLoading(true);

    try {
      await loadScript("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js");
      const htmlToImage = (window as any).htmlToImage;
      if (!htmlToImage?.toPng) throw new Error("Gerador de imagem indisponível.");

      const node = document.getElementById("testimonial-card") as HTMLElement | null;
      if (!node) throw new Error("Card não encontrado na página.");

      const { width, height } = getExportSize(filename);
      const { host, clone } = prepareCloneForExport(node, width, height);

      try {
        await document.fonts?.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await inlineAllImagesForExport(clone);

        const dataUrl = await htmlToImage.toPng(clone, {
          cacheBust: true,
          pixelRatio: 1,
          width,
          height,
          canvasWidth: width,
          canvasHeight: height,
          backgroundColor: "#030712",
          imagePlaceholder: TRANSPARENT_PIXEL,
          style: {
            transform: "none",
            width: `${width}px`,
            height: `${height}px`,
            opacity: "1",
            visibility: "visible",
            filter: "none",
            backdropFilter: "none",
            boxShadow: "none",
          },
        });

        await triggerDownload(dataUrl, filename);
      } finally {
        host.remove();
      }
    } catch (caughtError) {
      console.error("[testimonial-card] download failed", caughtError);
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível baixar o card.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={download}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Download size={15} />
        {loading ? "Gerando PNG..." : "Baixar PNG"}
      </button>
      {error ? <p className="text-xs text-red-200">{error}</p> : null}
    </div>
  );
}
