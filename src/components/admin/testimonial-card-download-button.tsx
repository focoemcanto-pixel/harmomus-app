"use client";

import { useState } from "react";
import { Download } from "lucide-react";

interface TestimonialCardDownloadButtonProps {
  filename: string;
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

async function waitForImages(node: HTMLElement) {
  await Promise.all(
    Array.from(node.querySelectorAll("img")).map((img) => {
      const image = img as HTMLImageElement;
      const originalSrc = image.currentSrc || image.src || image.getAttribute("src") || "";
      if (originalSrc) {
        image.crossOrigin = "anonymous";
        const proxiedSrc = proxiedImageUrl(originalSrc);
        if (image.src !== proxiedSrc) image.src = proxiedSrc;
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
      }

      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      });
    }),
  );
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
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await waitForImages(clone);

        const dataUrl = await htmlToImage.toPng(clone, {
          cacheBust: true,
          pixelRatio: 1,
          width,
          height,
          canvasWidth: width,
          canvasHeight: height,
          backgroundColor: "#030712",
          imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
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

        const link = document.createElement("a");
        link.download = filename;
        link.href = dataUrl;
        link.click();
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
