"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type Stats = { playlists: number; favorites: number; history: number; kitsToday: number };

type Point = { x: number; y: number };

const AVATAR_SIZE = 720;

export function ProfilePageClient({ initialName, email, username, planName, subscriptionStatus, avatarUrl, userId, stats }: { initialName: string; email: string; username: string; planName: string; subscriptionStatus: string; avatarUrl: string | null; userId: string; stats: Stats }) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const nameInitial = useMemo(() => (name || email || "U").slice(0, 1).toUpperCase(), [name, email]);

  function resetEditor() {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }

  async function onPick(file: File) {
    setUploading(true);
    try {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      resetEditor();
      setOpen(true);
    } finally {
      setUploading(false);
    }
  }

  async function renderAvatarBlob(source: string): Promise<Blob> {
    const img = new Image();
    img.src = source;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a imagem.");

    ctx.fillStyle = "#090b12";
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.translate(AVATAR_SIZE / 2, AVATAR_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    const scale = Math.max(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height) * zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;

    ctx.drawImage(img, -drawW / 2 + position.x, -drawH / 2 + position.y, drawW, drawH);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (!blob) throw new Error("Falha ao otimizar a imagem.");
    return blob;
  }

  async function saveAvatar() {
    if (!imageSrc) return;
    setSaving(true);
    try {
      const blob = await renderAvatarBlob(imageSrc);
      const form = new FormData();
      form.append("file", new File([blob], "avatar.webp", { type: "image/webp" }));
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar avatar");
      const versionedUrl = `${data.url}${data.url.includes("?") ? "&" : "?"}v=${Date.now()}`;
      setAvatar(versionedUrl);
      window.localStorage.setItem("harmomus-avatar-url", versionedUrl);
      window.dispatchEvent(new Event("harmomus:avatar-updated"));
      setOpen(false);
      setImageSrc(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar avatar");
    } finally {
      setSaving(false);
    }
  }

  return <main className="bg-gradient-to-b from-[#06070d] to-[#0f1523] p-4 text-white md:p-6">
    <section className="mx-auto max-w-5xl rounded-3xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
      <div className="mb-6"><Link href="/" className="inline-flex rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-300/20">← Voltar para Home</Link></div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="group relative block h-24 w-24 overflow-hidden rounded-full border border-cyan-300/40 bg-black/30 shadow-[0_0_30px_rgba(56,189,248,0.2)]">
            {avatar ? <img src={avatar} className="h-full w-full object-cover" alt="avatar" /> : <span className="flex h-full items-center justify-center text-2xl font-semibold">{nameInitial}</span>}
          </label>
          <div><input className="rounded-lg bg-white/5 px-3 py-2" value={name} onChange={(e)=>setName(e.target.value)} /><p className="text-zinc-300">@{username}</p><p className="text-zinc-400">{email}</p></div>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 transition hover:bg-white/20">Alterar foto</button>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">{[["Plano", planName],["Assinatura", subscriptionStatus],["Kits hoje", String(stats.kitsToday)],["Histórico", String(stats.history)]].map(([k,v]) => <div key={k} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-400">{k}</p><p className="text-lg font-medium">{v}</p></div>)}</div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">{[["Playlists",stats.playlists],["Favoritos",stats.favorites],["Segurança","Alterar senha"]].map((it)=> <div key={String(it[0])} className="rounded-2xl border border-white/10 bg-white/5 p-4">{it[0]}: <span className="text-zinc-200">{String(it[1])}</span></div>)}</div>
      <a href="/logout" className="mt-8 inline-block rounded-lg border border-rose-300/40 px-4 py-2 text-rose-200">Logout</a>
    </section>

    {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-3 backdrop-blur-md md:p-6">
      <div className="w-full max-w-5xl rounded-3xl border border-white/15 bg-gradient-to-br from-[#0d1324] to-[#06080f] p-4 shadow-2xl md:p-6">
        <h3 className="mb-4 text-xl font-semibold">Ajustar foto de perfil</h3>
        {!imageSrc ? <label onDragOver={(e)=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files?.[0];if(f) onPick(f);}} className={`block rounded-2xl border-2 border-dashed p-12 text-center ${dragOver?"border-cyan-300 bg-cyan-400/10":"border-white/20 bg-white/5"}`}><input type="file" accept="image/*" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];if(f) onPick(f);}}/>Arraste uma imagem ou clique para selecionar</label> : <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
          <div>
            <div className="relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-full border border-white/20 bg-black">
              <img
                src={imageSrc}
                alt="preview"
                onMouseDown={(e)=>{dragRef.current={sx:e.clientX,sy:e.clientY,ox:position.x,oy:position.y};}}
                onMouseMove={(e)=>{if(!dragRef.current) return; setPosition({ x: dragRef.current.ox + e.clientX - dragRef.current.sx, y: dragRef.current.oy + e.clientY - dragRef.current.sy });}}
                onMouseUp={()=>{dragRef.current=null;}}
                onMouseLeave={()=>{dragRef.current=null;}}
                onTouchStart={(e)=>{const t=e.touches[0];dragRef.current={sx:t.clientX,sy:t.clientY,ox:position.x,oy:position.y};}}
                onTouchMove={(e)=>{const t=e.touches[0]; if(!dragRef.current) return; setPosition({ x: dragRef.current.ox + t.clientX - dragRef.current.sx, y: dragRef.current.oy + t.clientY - dragRef.current.sy });}}
                onTouchEnd={()=>{dragRef.current=null;}}
                className="absolute left-1/2 top-1/2 max-w-none touch-none select-none"
                style={{ transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)` }}
              />
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-sm text-zinc-300">Zoom<input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e)=>setZoom(Number(e.target.value))} className="mt-2 w-full" /></label>
              <label className="block text-sm text-zinc-300">Rotação<input type="range" min={-180} max={180} step={1} value={rotation} onChange={(e)=>setRotation(Number(e.target.value))} className="mt-2 w-full" /></label>
            </div>
          </div>
          <aside className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-zinc-300">Preview final</p>
            <div className="mt-3 h-40 w-40 overflow-hidden rounded-full border border-cyan-200/40 bg-black">
              {imageSrc ? <img src={imageSrc} alt="preview final" className="h-full w-full object-cover" style={{ transform: `translate(${position.x * 0.3}px, ${position.y * 0.3}px) scale(${zoom}) rotate(${rotation}deg)` }} /> : null}
            </div>
            <p className="mt-3 text-xs text-zinc-400">Imagem será salva otimizada em formato quadrado para avatar.</p>
          </aside>
        </div>}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-xl border border-white/20 px-4 py-3 text-sm" onClick={()=>setOpen(false)}>Cancelar</button><button disabled={saving || !imageSrc || uploading} onClick={saveAvatar} className="rounded-xl border border-cyan-300/50 bg-cyan-400/20 px-5 py-3 text-sm font-semibold text-cyan-100 disabled:opacity-60">{saving?"Salvando foto...":"Salvar foto"}</button></div>
      </div>
    </div> : null}
  </main>;
}
