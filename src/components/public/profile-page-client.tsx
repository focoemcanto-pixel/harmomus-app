"use client";

import Link from "next/link";
import { ChangeEvent, MouseEvent, TouchEvent, useMemo, useRef, useState } from "react";

type Stats = { playlists: number; favorites: number; history: number; kitsToday: number };
type Point = { x: number; y: number };
type TouchPoint = { clientX: number; clientY: number };

type ProfilePageClientProps = {
  initialName: string;
  email: string;
  username: string;
  planName: string;
  subscriptionStatus: string;
  avatarUrl: string | null;
  userId: string;
  emailConfirmed?: boolean;
  stats: Stats;
};

const AVATAR_SIZE = 720;
const CROP_SIZE = 320;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 5;

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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-black text-white">{value}</p>
    </div>
  );
}

export function ProfilePageClient({ initialName, email, username, planName, subscriptionStatus, avatarUrl, userId: _userId, emailConfirmed = false, stats }: ProfilePageClientProps) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [savingName, setSavingName] = useState(false);
  const [passwordResetState, setPasswordResetState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [passwordResetMessage, setPasswordResetMessage] = useState("");
  const [emailConfirmationState, setEmailConfirmationState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailConfirmationMessage, setEmailConfirmationMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation] = useState(0);
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

  async function requestEmailConfirmation() {
    try {
      setEmailConfirmationState("sending");
      setEmailConfirmationMessage("");
      const response = await fetch("/api/auth/email-confirmation/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível reenviar a confirmação.");
      setEmailConfirmationState("sent");
      setEmailConfirmationMessage("Enviamos um novo link de confirmação para seu e-mail.");
    } catch (error) {
      setEmailConfirmationState("error");
      setEmailConfirmationMessage(error instanceof Error ? error.message : "Erro ao reenviar confirmação.");
    }
  }

  function resetEditor() {
    setZoom(1);
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

    const baseScale = Math.min(CROP_SIZE / img.width, CROP_SIZE / img.height);
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
    setPosition({ x: dragRef.current.ox + clientX - dragRef.current.sx, y: dragRef.current.oy + clientY - dragRef.current.sy });
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
    event.preventDefault();
    if (event.touches.length === 2 && pinchRef.current) {
      const current = distance(event.touches[0], event.touches[1]);
      setZoom(clamp(pinchRef.current.zoom * (current / pinchRef.current.distance), MIN_ZOOM, MAX_ZOOM));
      return;
    }
    const touch = event.touches[0];
    if (touch) moveDrag(touch.clientX, touch.clientY);
  }

  const editorImageStyle = imageSrc
    ? { transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) rotate(${rotation}deg) scale(${zoom})` }
    : undefined;

  return <main className="min-h-screen overflow-x-hidden bg-[#06080d] px-3 py-6 text-white md:px-6 md:py-10">
    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />

    <section className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[1.8rem] border border-emerald-400/20 bg-gradient-to-br from-zinc-950 via-[#121720] to-violet-950/40 p-4 shadow-[0_0_120px_rgba(16,185,129,0.1)] md:rounded-[2.4rem] md:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,197,94,0.16),transparent_35%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.18),transparent_32%)]" />
      <div className="relative z-10">
        <Link href="/" className="inline-flex rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-300/20">← Voltar para Home</Link>

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
          <aside className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="group relative mx-auto block h-36 w-36 overflow-hidden rounded-full border-2 border-cyan-300/50 bg-black/30 shadow-[0_0_40px_rgba(34,211,238,0.18)]">
              {avatar ? <img src={avatar} className="h-full w-full object-cover" alt="avatar" /> : <span className="flex h-full items-center justify-center text-5xl font-black">{nameInitial}</span>}
              <span className="absolute inset-x-0 bottom-0 bg-black/75 py-2 text-xs font-semibold text-cyan-100 opacity-0 transition group-hover:opacity-100">Alterar foto</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="mt-5 w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15 disabled:opacity-60">
              {uploading ? "Carregando..." : "Alterar foto"}
            </button>
            <p className="mt-4 text-xs leading-5 text-zinc-400">Use uma foto nítida para personalizar seu perfil e seu selo no topo do app.</p>
          </aside>

          <div className="min-w-0 space-y-5">
            <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Meu perfil</p>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <input className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-base outline-none ring-cyan-300/30 focus:ring" value={name} onChange={(e)=>setName(e.target.value)} />
                <button onClick={saveProfileName} disabled={savingName} className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-6 py-4 text-sm font-black text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-60">
                  {savingName ? "Salvando..." : "Salvar"}
                </button>
              </div>
              <div className="mt-4 min-w-0">
                <p className="truncate text-lg font-semibold text-zinc-200">@{username}</p>
                <p className="break-all text-sm text-zinc-400">{email}</p>
              </div>
            </div>

            <div className={`rounded-[2rem] border p-5 text-sm ${emailConfirmed ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-yellow-300/30 bg-yellow-300/10 text-yellow-50"}`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-base font-black">{emailConfirmed ? "E-mail confirmado" : "Confirmação de e-mail pendente"}</p>
                  <p className="mt-1 opacity-90">
                    {emailConfirmed
                      ? "Sua conta está protegida e pronta para recuperação de senha."
                      : "Você pode usar o Harmomus normalmente. Confirme seu e-mail apenas para aumentar a segurança e facilitar a recuperação de senha."}
                  </p>
                </div>
                {!emailConfirmed ? (
                  <button type="button" onClick={requestEmailConfirmation} disabled={emailConfirmationState === "sending"} className="shrink-0 rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-200 disabled:cursor-wait disabled:opacity-70">
                    {emailConfirmationState === "sending" ? "Enviando..." : "Enviar confirmação"}
                  </button>
                ) : null}
              </div>
              {emailConfirmationMessage ? <p className={`mt-3 text-xs ${emailConfirmationState === "error" ? "text-rose-100" : "text-emerald-100"}`}>{emailConfirmationMessage}</p> : null}
            </div>

            {pendingSubscription ? (
              <div className="rounded-[2rem] border border-amber-300/30 bg-amber-400/10 p-5 text-sm text-amber-100">
                <p className="font-semibold">Assinatura pendente</p>
                <p className="mt-1 text-amber-100/85">Seu perfil mostra o plano {planName}, mas a assinatura ainda está como {readableStatus}. Conclua o pagamento ou aguarde a confirmação para liberar o acesso completo.</p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Plano" value={planName} />
              <StatCard label="Assinatura" value={readableStatus} />
              <StatCard label="Kits hoje" value={String(stats.kitsToday)} />
              <StatCard label="Histórico" value={String(stats.history)} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <StatCard label="Playlists" value={String(stats.playlists)} />
              <StatCard label="Favoritos" value={String(stats.favorites)} />
              <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Segurança</p>
                <button type="button" onClick={requestPasswordReset} disabled={passwordResetState === "sending"} className="mt-2 w-full text-left text-lg font-black text-cyan-100 disabled:opacity-60">
                  {passwordResetState === "sending" ? "Enviando link..." : "Alterar senha"}
                </button>
                {passwordResetMessage ? <p className={`mt-2 text-xs ${passwordResetState === "error" ? "text-rose-200" : "text-emerald-200"}`}>{passwordResetMessage}</p> : null}
              </div>
            </div>

            <a href="/logout" className="inline-flex rounded-2xl border border-rose-300/40 px-5 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-500/10">Sair da conta</a>
          </div>
        </div>
      </div>
    </section>

    {open ? <div className="fixed inset-0 z-50 bg-black/95 text-white backdrop-blur-md md:grid md:place-items-center md:p-6">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#070b14] md:h-auto md:max-h-[92vh] md:max-w-xl md:rounded-3xl md:border md:border-white/15 md:shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-4 md:px-6">
          <div>
            <h3 className="text-xl font-semibold">Ajustar foto</h3>
            <p className="mt-1 text-xs text-zinc-400">Use a pinça para aproximar e arraste para posicionar.</p>
          </div>
          <button className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-zinc-200" onClick={() => { setOpen(false); endGesture(); }}>Fechar</button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden px-4 py-6">
          {imageSrc ? (
            <div className="relative h-[320px] w-[320px] max-w-full touch-none overflow-hidden rounded-3xl bg-black/40" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={endGesture} onMouseLeave={endGesture} onDoubleClick={resetEditor} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={endGesture}>
              <img src={imageSrc} alt="Prévia" draggable={false} className="absolute left-1/2 top-1/2 max-h-full max-w-full select-none" style={editorImageStyle} />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0_49%,rgba(0,0,0,0.68)_50%)]" />
              <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-cyan-200/75 shadow-[0_0_30px_rgba(34,211,238,0.22)]" />
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-zinc-200">Pinça para ampliar • arraste para mover</div>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); const file = event.dataTransfer.files?.[0]; if (file) void onPick(file); }} className={`grid min-h-[320px] w-full place-items-center rounded-3xl border border-dashed p-8 text-center transition ${dragOver ? "border-cyan-300 bg-cyan-300/10" : "border-white/20 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
              <span><span className="block text-lg font-semibold">Escolher imagem</span><span className="mt-2 block text-sm text-zinc-400">JPG, PNG ou WEBP. Você poderá ajustar antes de salvar.</span></span>
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
