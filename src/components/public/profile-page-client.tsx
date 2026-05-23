"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type Stats = { playlists: number; favorites: number; history: number; kitsToday: number };
type Point = { x: number; y: number };
type TouchPoint = { clientX: number; clientY: number };

const AVATAR_SIZE = 720;
const CROP_SIZE = 320;

function distance(a: TouchPoint, b: TouchPoint) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

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
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const nameInitial = useMemo(() => (name || email || "U").slice(0, 1).toUpperCase(), [name, email]);

  function resetEditor() {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    dragRef.current = null;
    pinchRef.current = null;
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
    ctx.save();
    ctx.beginPath();
    ctx.arc(AVATAR_SIZE / 2, AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(AVATAR_SIZE / 2, AVATAR_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    const baseScale = Math.max(CROP_SIZE / img.width, CROP_SIZE / img.height);
    const exportScale = AVATAR_SIZE / CROP_SIZE;
    const drawW = img.width * baseScale * zoom * exportScale;
    const drawH = img.height * baseScale * zoom * exportScale;
    const drawX = -drawW / 2 + position.x * exportScale;
    const drawY = -drawH / 2 + position.y * exportScale;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

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

  function startDrag(clientX: number, clientY: number) {
    dragRef.current = { sx: clientX, sy: clientY, ox: position.x, oy: position.y };
  }

  function moveDrag(clientX: number, clientY: number) {
    if (!dragRef.current) return;
    setPosition({
      x: dragRef.current.ox + clientX - dragRef.current.sx,
      y: dragRef.current.oy + clientY - dragRef.current.sy,
    });
  }

  function endGesture() {
    dragRef.current = null;
    pinchRef.current = null;
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

    {open ? <div className="fixed inset-0 z-50 bg-black/90 text-white backdrop-blur-md md:grid md:place-items-center md:p-6">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-br from-[#0d1324] to-[#06080f] md:h-auto md:max-h-[92vh] md:max-w-3xl md:rounded-3xl md:border md:border-white/15 md:shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-4 md:px-6">
          <div>
            <h3 className="text-xl font-semibold">Ajustar foto de perfil</h3>
            {imageSrc ? <p className="mt-1 text-xs text-zinc-400">Arraste a foto e use pinça para aproximar.</p> : null}
          </div>
          <button className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-zinc-200" onClick={() => { setOpen(false); endGesture(); }}>Fechar</button>
        </div>

        {!imageSrc ? <div className="flex min-h-0 flex-1 items-center justify-center p-5">
          <label
            onDragOver={(e)=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files?.[0];if(f) onPick(f);}}
            className={`block w-full rounded-3xl border-2 border-dashed p-12 text-center ${dragOver?"border-cyan-300 bg-cyan-400/10":"border-white/20 bg-white/5"}`}
          >
            <input type="file" accept="image/*" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];if(f) onPick(f);}} />
            <span className="text-lg font-medium">Toque para selecionar uma foto</span>
            <span className="mt-2 block text-sm text-zinc-400">ou arraste uma imagem aqui</span>
          </label>
        </div> : <>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-hidden px-4 py-5">
            <div
              className="relative aspect-square w-[min(78vw,320px)] overflow-hidden rounded-full border border-cyan-200/30 bg-black shadow-[0_0_60px_rgba(34,211,238,0.12)] touch-none select-none"
              onMouseDown={(e)=>startDrag(e.clientX, e.clientY)}
              onMouseMove={(e)=>moveDrag(e.clientX, e.clientY)}
              onMouseUp={endGesture}
              onMouseLeave={endGesture}
              onWheel={(e)=>{
                e.preventDefault();
                setZoom((z) => Math.min(4, Math.max(0.6, z + (e.deltaY < 0 ? 0.08 : -0.08))));
              }}
              onTouchStart={(e)=>{
                if (e.touches.length === 2) {
                  pinchRef.current = { distance: distance(e.touches[0], e.touches[1]), zoom };
                  dragRef.current = null;
                  return;
                }
                const t = e.touches[0];
                if (t) startDrag(t.clientX, t.clientY);
              }}
              onTouchMove={(e)=>{
                e.preventDefault();
                if (e.touches.length === 2 && pinchRef.current) {
                  const next = pinchRef.current.zoom * (distance(e.touches[0], e.touches[1]) / pinchRef.current.distance);
                  setZoom(Math.min(4, Math.max(0.6, next)));
                  return;
                }
                const t = e.touches[0];
                if (t) moveDrag(t.clientX, t.clientY);
              }}
              onTouchEnd={endGesture}
            >
              <img
                src={imageSrc}
                alt="preview"
                draggable={false}
                className="absolute left-1/2 top-1/2 h-full w-full max-w-none object-cover"
                style={{ transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)` }}
              />
              <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/20" />
            </div>

            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
              <label className="block text-sm text-zinc-300">Zoom
                <input type="range" min={0.6} max={4} step={0.01} value={zoom} onChange={(e)=>setZoom(Number(e.target.value))} className="mt-2 w-full" />
              </label>
              <label className="block text-sm text-zinc-300">Rotação
                <input type="range" min={-35} max={35} step={1} value={rotation} onChange={(e)=>setRotation(Number(e.target.value))} className="mt-2 w-full" />
              </label>
            </div>
          </div>
        </>}

        <div className="shrink-0 border-t border-white/10 bg-black/35 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:px-6 md:pb-4">
          <div className="flex gap-3">
            <button className="h-12 flex-1 rounded-xl border border-white/20 text-sm font-medium" onClick={() => { setOpen(false); endGesture(); }}>Cancelar</button>
            <button disabled={saving || !imageSrc || uploading} onClick={saveAvatar} className="h-12 flex-[1.35] rounded-xl border border-cyan-300/50 bg-cyan-400/20 text-sm font-semibold text-cyan-100 disabled:opacity-60">{saving ? "Salvando..." : "Salvar foto"}</button>
          </div>
        </div>
      </div>
    </div> : null}
  </main>;
}
