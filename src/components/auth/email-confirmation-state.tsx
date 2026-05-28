"use client";
import { useMemo, useState } from "react";

type Props = { variant: "free" | "premium"; email: string; allowEmailEdit: boolean; allowResend: boolean };

export function EmailConfirmationState({ variant, email, allowEmailEdit, allowResend }: Props) {
  const [loadingResend, setLoadingResend] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const title = useMemo(() => variant === "premium" ? "Seu pagamento foi confirmado. Agora confirme seu e-mail para liberar seu acesso Premium." : "Confirme seu e-mail para acessar sua conta.", [variant]);

  async function handleResend() {
    setLoadingResend(true); setError(null); setMessage(null);
    const response = await fetch("/api/auth/email-confirmation/resend", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload?.error ?? "Não foi possível reenviar o e-mail agora."); setLoadingResend(false); return; }
    setMessage("Novo e-mail enviado com sucesso."); setLoadingResend(false);
  }

  async function handleSaveEmail() {
    setError(null); setMessage(null);
    if (!newEmail || !confirmEmail) return setError("Preencha os dois campos de e-mail.");
    if (newEmail.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) return setError("Os e-mails informados não conferem.");
    setLoadingSave(true);
    const response = await fetch("/api/auth/email-confirmation/update-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newEmail: newEmail.trim().toLowerCase() }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload?.error ?? "Não foi possível atualizar o e-mail."); setLoadingSave(false); return; }
    setMessage(`Pronto! Atualizamos seu e-mail.\n\nEnviamos uma nova confirmação para:\n${payload?.email ?? newEmail.trim().toLowerCase()}`);
    setNewEmail(""); setConfirmEmail(""); setIsOpen(false); setLoadingSave(false);
  }

  return <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-5 text-sm text-cyan-50">
    <h2 className="text-base font-semibold text-cyan-100">{title}</h2>
    <p className="mt-3">Enviamos a confirmação para:</p><p className="break-all font-semibold">{email || "E-mail não identificado"}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      {allowResend ? <button type="button" onClick={handleResend} disabled={loadingResend} className="rounded-xl bg-cyan-300 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-60">{loadingResend ? "Enviando..." : "Reenviar e-mail"}</button> : null}
      {allowEmailEdit ? <button type="button" onClick={() => setIsOpen(true)} className="rounded-xl border border-cyan-200/60 px-4 py-2 font-semibold text-cyan-100">Digitei o e-mail errado</button> : null}
    </div>
    {message ? <p className="mt-4 whitespace-pre-line rounded-xl border border-emerald-300/40 bg-emerald-500/10 p-3 text-emerald-100">{message}</p> : null}
    {error ? <p className="mt-4 rounded-xl border border-rose-300/40 bg-rose-500/10 p-3 text-rose-100">{error}</p> : null}
    {isOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl border border-white/20 bg-zinc-950 p-5"><h3 className="text-lg font-semibold text-white">Alterar e-mail</h3><div className="mt-4 space-y-3"><input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Novo e-mail" className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white" /><input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder="Confirmar novo e-mail" className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white" /></div><div className="mt-5 flex gap-2"><button type="button" onClick={handleSaveEmail} disabled={loadingSave} className="rounded-xl bg-cyan-300 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-60">{loadingSave ? "Salvando..." : "Salvar novo e-mail"}</button><button type="button" onClick={() => setIsOpen(false)} className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200">Cancelar</button></div></div></div> : null}
  </div>;
}
