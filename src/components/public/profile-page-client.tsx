"use client";

import { useMemo, useRef, useState } from "react";

type Stats = { playlists: number; favorites: number; history: number; kitsToday: number };

export function ProfilePageClient({ initialName, email, username, planName, subscriptionStatus, avatarUrl, userId, stats }: { initialName: string; email: string; username: string; planName: string; subscriptionStatus: string; avatarUrl: string | null; userId: string; stats: Stats }) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const nameInitial = useMemo(() => (name || email || "U").slice(0, 1).toUpperCase(), [name, email]);

  async function onPick(file: File) {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setScale(1);
    setX(0);
    setY(0);
    setOpen(true);
  }

  async function saveAvatar() {
    if (!imageSrc) return;
    setSaving(true);
    try {
      const img = new Image();
      img.src = imageSrc;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const size = 720;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, size, size);
      const w = img.width * scale;
      const h = img.height * scale;
      const cx = size / 2 + x;
      const cy = size / 2 + y;
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
      if (!blob) return;
      const form = new FormData();
      form.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar avatar");
      setAvatar(data.url);
      setOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar avatar");
    } finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-gradient-to-b from-[#06070d] to-[#0f1523] p-6 text-white">
    <section className="mx-auto max-w-5xl rounded-3xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="group relative block h-24 w-24 cursor-pointer overflow-hidden rounded-full border border-cyan-300/40 bg-black/30 shadow-[0_0_30px_rgba(56,189,248,0.2)]">
            {avatar ? <img src={avatar} className="h-full w-full object-cover" alt="avatar" /> : <span className="flex h-full items-center justify-center text-2xl font-semibold">{nameInitial}</span>}
          </label>
          <div><input className="rounded-lg bg-white/5 px-3 py-2" value={name} onChange={(e)=>setName(e.target.value)} /><p className="text-zinc-300">@{username}</p><p className="text-zinc-400">{email}</p></div>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 transition hover:bg-white/20">Alterar foto</button>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-4">{[
        ["Plano", planName],["Assinatura", subscriptionStatus],["Kits hoje", String(stats.kitsToday)],["Histórico", String(stats.history)]
      ].map(([k,v]) => <div key={k} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-400">{k}</p><p className="text-lg font-medium">{v}</p></div>)}</div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">{[["Playlists",stats.playlists],["Favoritos",stats.favorites],["Segurança","Alterar senha"]].map((it)=> <div key={String(it[0])} className="rounded-2xl border border-white/10 bg-white/5 p-4">{it[0]}: <span className="text-zinc-200">{String(it[1])}</span></div>)}</div>
      <a href="/logout" className="mt-8 inline-block rounded-lg border border-rose-300/40 px-4 py-2 text-rose-200">Logout</a>
    </section>

    {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-[#0f1523]/90 p-5 shadow-2xl backdrop-blur-2xl">
        <h3 className="mb-4 text-lg font-semibold">Alterar foto</h3>
        {!imageSrc ? <label onDragOver={(e)=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files?.[0];if(f) onPick(f);}} className={`block rounded-2xl border-2 border-dashed p-12 text-center ${dragOver?"border-cyan-300 bg-cyan-400/10":"border-white/20 bg-white/5"}`}><input type="file" accept="image/*" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];if(f) onPick(f);}}/>Arraste uma imagem ou clique para selecionar</label> : <>
          <div className="relative mx-auto h-80 w-80 overflow-hidden rounded-full border border-white/20">
            <img src={imageSrc} alt="preview" onMouseDown={(e)=>{setDragging(true);dragRef.current={sx:e.clientX,sy:e.clientY,ox:x,oy:y};}} onMouseMove={(e)=>{if(!dragging||!dragRef.current) return; setX(dragRef.current.ox + e.clientX - dragRef.current.sx); setY(dragRef.current.oy + e.clientY - dragRef.current.sy);}} onMouseUp={()=>setDragging(false)} onMouseLeave={()=>setDragging(false)} onTouchStart={(e)=>{const t=e.touches[0];dragRef.current={sx:t.clientX,sy:t.clientY,ox:x,oy:y};}} onTouchMove={(e)=>{const t=e.touches[0]; if(!dragRef.current) return; setX(dragRef.current.ox + t.clientX - dragRef.current.sx); setY(dragRef.current.oy + t.clientY - dragRef.current.sy);}} className="absolute left-1/2 top-1/2 max-w-none select-none" style={{ transform: `translate(-50%,-50%) translate(${x}px,${y}px) scale(${scale})` }} />
          </div>
          <div className="mt-4"><input type="range" min={0.6} max={3} step={0.01} value={scale} onChange={(e)=>setScale(Number(e.target.value))} className="w-full" /></div>
        </>}
        <div className="mt-5 flex justify-end gap-2"><button className="rounded-lg px-3 py-2" onClick={()=>setOpen(false)}>Cancelar</button><button disabled={saving || !imageSrc} onClick={saveAvatar} className="rounded-lg border border-cyan-300/50 bg-cyan-400/20 px-4 py-2">{saving?"Salvando...":"Salvar"}</button></div>
      </div>
    </div> : null}
  </main>;
}
