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
  host.style.zIndex = "2147483647";
  host.style.background = "#030712";
  host.style.transform = "translateX(-200vw)";

  const clone = source.cloneNode(true) as HTMLElement;
  clone.className = clone.className
    .replace(/scale-\[[^\]]+\]/g, "")
    .replace(/origin-top/g, "")
    .replace(/print:[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

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

async function waitForImages(node: HTMLElement) {
  await Promise.all(
    Array.from(node.querySelectorAll("img")).map((img) => {
      const image = img as HTMLImageElement;
      image.crossOrigin = "anonymous";
      if (image.complete) return Promise.resolve();
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
          style: {
            transform: "none",
            width: `${width}px`,
            height: `${height}px`,
            opacity: "1",
            visibility: "visible",
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
