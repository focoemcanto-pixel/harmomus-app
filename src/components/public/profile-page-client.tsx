"use client";

import Link from "next/link";
import { ChangeEvent, MouseEvent, TouchEvent, useMemo, useRef, useState } from "react";

type Stats = { playlists: number; favorites: number; history: number; kitsToday: number };
type Point = { x: number; y: number };
type TouchPoint = { clientX: number; clientY: number };

const AVATAR_SIZE = 720;
const CROP_SIZE = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function distance(a: TouchPoint, b: TouchPoint) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatSubscriptionStatus(status: string) {
  const normalized = String(status ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    active: "Ativa",
    trialing: "Teste ativo",
    pending: "Pendente",
    incomplete: "Pagamento pendente",
    past_due: "Pagamento atrasado",
    canceled: "Cancelada",
    cancelled: "Cancelada",
    expired: "Expirada",
    free: "Free",
  };
  return map[normalized] ?? status;
}

function isPendingSubscription(status: string) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return ["pending", "incomplete", "past_due"].includes(normalized);
}

export function ProfilePageClient({ initialName, email, username, planName, subscriptionStatus, avatarUrl, userId: _userId, stats }: { initialName: string; email: string; username: string; planName: string; subscriptionStatus: string; avatarUrl: string | null; userId: string; stats: Stats }) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [savingName, setSavingName] = useState(false);
  const [passwordResetState, setPasswordResetState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [passwordResetMessage, setPasswordResetMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.25);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const nameInitial = useMemo(() => (name || email || "U").slice(0, 1).toUpperCase(), [name, email]);
  const readableStatus = formatSubscriptionStatus(subscriptionStatus);
  const pendingSubscription = isPendingSubscription(subscriptionStatus);

  async function saveProfileName() {
    try {
      setSavingName(true);
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Erro ao salvar nome.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erro ao salvar nome.");
    } finally {
      setSavingName(false);
    }
  }

  async function requestPasswordReset() {
    try {
      setPasswordResetState("sending");
      setPasswordResetMessage("");
      const response = await fetch("/api/profile/password-reset", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível enviar o e-mail de alteração de senha.");
      setPasswordResetState("sent");
      setPasswordResetMessage("Enviamos um link de alteração de senha para seu e-mail.");
    } catch (error) {
      setPasswordResetState("error");
      setPasswordResetMessage(error instanceof Error ? error.message : "Erro ao solicitar alteração de senha.");
    }
  }

  function resetEditor() {
    setZoom(1.25);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    dragRef.current = null;
    pinchRef.current = null;
  }

  async function onPick(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("Envie uma imagem válida.");
      return;
    }

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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void onPick(file);
    event.target.value = "";
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

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    startDrag(event.clientX, event.clientY);
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    moveDrag(event.clientX, event.clientY);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2) {
      pinchRef.current = { distance: distance(event.touches[0], event.touches[1]), zoom };
      return;
    }
    const touch = event.touches[0];
    if (touch) startDrag(touch.clientX, touch.clientY);
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2 && pinchRef.current) {
      const current = distance(event.touches[0], event.touches[1]);
      setZoom(clamp(pinchRef.current.zoom * (current / pinchRef.current.distance), MIN_ZOOM, MAX_ZOOM));
      return;
    }
    const touch = event.touches[0];
    if (touch) moveDrag(touch.clientX, touch.clientY);
  }

  const editorImageStyle = imageSrc
    ? {
        transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) rotate(${rotation}deg) scale(${zoom})`,
      }
    : undefined;

  return <main className="bg-gradient-to-b from-[#06070d] to-[#0f1523] p-3 text-white md:p-6">
    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />

    <section className="mx-auto w-full max-w-5xl rounded-3xl border border-white/15 bg-white/5 p-4 shadow-2xl backdrop-blur-xl md:p-6">
      <div className="mb-6"><Link href="/" className="inline-flex rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-300/20">← Voltar para Home</Link></div>

      <div className="grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex justify-center md:justify-start">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="group relative block h-28 w-28 overflow-hidden rounded-full border border-cyan-300/40 bg-black/30 shadow-[0_0_30px_rgba(56,189,248,0.2)] md:h-24 md:w-24">
            {avatar ? <img src={avatar} className="h-full w-full object-cover" alt="avatar" /> : <span className="flex h-full items-center justify-center text-3xl font-semibold">{nameInitial}</span>}
            <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-[10px] font-semibold text-cyan-100 opacity-0 transition group-hover:opacity-100">Alterar</span>
          </button>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input className="min-w-0 rounded-xl bg-white/5 px-4 py-3 text-base outline-none ring-cyan-300/30 focus:ring" value={name} onChange={(e)=>setName(e.target.value)} />
            <button onClick={saveProfileName} disabled={savingName} className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-60">
              {savingName ? "Salvando..." : "Salvar"}
            </button>
          </div>
          <div className="min-w-0 text-center md:text-left">
            <p className="truncate text-zinc-300">@{username}</p>
            <p className="break-all text-sm text-zinc-400">{email}</p>
          </div>
        </div>

        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 transition hover:bg-white/20 disabled:opacity-60 md:w-auto">
          {uploading ? "Carregando..." : "Alterar foto"}
        </button>
      </div>

      {pendingSubscription ? (
        <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Assinatura pendente</p>
          <p className="mt-1 text-amber-100/85">Seu perfil mostra o plano {planName}, mas a assinatura ainda está como {readableStatus}. Conclua o pagamento ou aguarde a confirmação para liberar o acesso completo.</p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Plano", planName],["Assinatura", readableStatus],["Kits hoje", String(stats.kitsToday)],["Histórico", String(stats.history)]].map(([k,v]) => <div key={k} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-400">{k}</p><p className="mt-1 text-lg font-medium">{v}</p></div>)}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Playlists: <span className="text-zinc-200">{stats.playlists}</span></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Favoritos: <span className="text-zinc-200">{stats.favorites}</span></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <button type="button" onClick={requestPasswordReset} disabled={passwordResetState === "sending"} className="w-full text-left font-medium text-cyan-100 disabled:opacity-60">
            🔐 {passwordResetState === "sending" ? "Enviando link..." : "Alterar senha"}
          </button>
          {passwordResetMessage ? <p className={`mt-2 text-xs ${passwordResetState === "error" ? "text-rose-200" : "text-emerald-200"}`}>{passwordResetMessage}</p> : null}
        </div>
      </div>

      <a href="/logout" className="mt-8 inline-block rounded-lg border border-rose-300/40 px-4 py-2 text-rose-200">Logout</a>
    </section>

    {open ? <div className="fixed inset-0 z-50 bg-black/90 text-white backdrop-blur-md md:grid md:place-items-center md:p-6">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-br from-[#0d1324] to-[#06080f] md:h-auto md:max-h-[92vh] md:max-w-3xl md:rounded-3xl md:border md:border-white/15 md:shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-4 md:px-6">
          <div>
            <h3 className="text-xl font-semibold">Ajustar foto de perfil</h3>
            <p className="mt-1 text-xs text-zinc-400">Arraste, amplie, rotacione e salve o recorte circular.</p>
          </div>
          <button className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-zinc-200" onClick={() => { setOpen(false); endGesture(); }}>Fechar</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {imageSrc ? (
            <div className="grid gap-6 md:grid-cols-[1fr_220px] md:items-start">
              <div>
                <div
                  className="relative mx-auto grid h-[320px] w-[320px] max-w-full touch-none place-items-center overflow-hidden rounded-3xl border border-white/15 bg-black/40"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={endGesture}
                  onMouseLeave={endGesture}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={endGesture}
                >
                  <img src={imageSrc} alt="Prévia" draggable={false} className="absolute left-1/2 top-1/2 max-h-none max-w-none select-none" style={editorImageStyle} />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0_49%,rgba(0,0,0,0.62)_50%)]" />
                  <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-cyan-200/70 shadow-[0_0_30px_rgba(34,211,238,0.25)]" />
                  <div className="pointer-events-none absolute bottom-3 rounded-full bg-black/60 px-3 py-1 text-[11px] text-zinc-200">Arraste para posicionar</div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Zoom</label>
                  <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="mt-3 w-full" />
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Rotação</label>
                  <input type="range" min="-180" max="180" step="1" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className="mt-3 w-full" />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={resetEditor} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10">Resetar</button>
                    <button type="button" onClick={() => setRotation((value) => value - 90)} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10">Girar -90°</button>
                    <button type="button" onClick={() => setRotation((value) => value + 90)} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10">Girar +90°</button>
                  </div>
                </div>
              </div>

              <aside className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Preview</p>
                <div className="relative mx-auto mt-4 h-32 w-32 overflow-hidden rounded-full border border-cyan-300/40 bg-black/40">
                  <img src={imageSrc} alt="Preview circular" draggable={false} className="absolute left-1/2 top-1/2 max-h-none max-w-none select-none" style={editorImageStyle} />
                </div>
                <p className="mt-4 text-xs leading-relaxed text-zinc-400">A imagem será otimizada em WEBP e salva em formato quadrado, ideal para perfil.</p>
              </aside>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => { event.preventDefault(); setDragOver(false); const file = event.dataTransfer.files?.[0]; if (file) void onPick(file); }}
              className={`grid min-h-[320px] w-full place-items-center rounded-3xl border border-dashed p-8 text-center transition ${dragOver ? "border-cyan-300 bg-cyan-300/10" : "border-white/20 bg-white/[0.03] hover:bg-white/[0.06]"}`}
            >
              <span>
                <span className="block text-lg font-semibold">Escolher imagem</span>
                <span className="mt-2 block text-sm text-zinc-400">JPG, PNG ou WEBP. Você poderá cortar antes de salvar.</span>
              </span>
            </button>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-white/10 px-4 py-4 md:flex-row md:justify-end md:px-6">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-white/10">Escolher outra foto</button>
          <button type="button" onClick={saveAvatar} disabled={!imageSrc || saving} className="rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Salvando..." : "Salvar foto"}
          </button>
        </div>
      </div>
    </div> : null}
  </main>;
}
