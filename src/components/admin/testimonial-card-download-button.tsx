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

      const node = document.getElementById("testimonial-card");
      if (!node) throw new Error("Card não encontrado na página.");

      const dataUrl = await htmlToImage.toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#030712",
      });

      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
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
