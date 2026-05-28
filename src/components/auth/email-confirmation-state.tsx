"use client";

import { useMemo, useState } from "react";

type Props = {
  variant: "free" | "premium";
  email: string;
  allowEmailEdit: boolean;
  allowResend: boolean;
  sessionId?: string | null;
};

export function EmailConfirmationState({ variant, email, allowEmailEdit, allowResend, sessionId }: Props) {
  const [currentEmail, setCurrentEmail] = useState(email);
  const [loadingResend, setLoadingResend] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");

  const title = useMemo(
    () =>
      variant === "premium"
        ? "Seu pagamento foi confirmado. Agora confirme seu e-mail para liberar seu acesso Premium."
        : "Confirme seu e-mail para acessar sua conta.",
    [variant],
  );

  async function parseResponse(response: Response) {
    return response.json().catch(() => ({}));
  }

  async function handleResend() {
    setLoadingResend(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/auth/email-confirmation/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: currentEmail, sessionId: sessionId ?? null }),
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
      setError(payload?.error ?? "Não foi possível reenviar o e-mail agora.");
      setLoadingResend(false);
      return;
    }

    setMessage(`Novo e-mail enviado com sucesso para:\n${payload?.email ?? currentEmail}`);
    setLoadingResend(false);
  }

  async function handleSaveEmail() {
    setError(null);
    setMessage(null);

    const normalizedNewEmail = newEmail.trim().toLowerCase();
    const normalizedConfirmEmail = confirmEmail.trim().toLowerCase();

    if (!normalizedNewEmail || !normalizedConfirmEmail) return setError("Preencha os dois campos de e-mail.");
    if (normalizedNewEmail !== normalizedConfirmEmail) return setError("Os e-mails informados não conferem.");

    setLoadingSave(true);

    const response = await fetch("/api/auth/email-confirmation/update-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: currentEmail, newEmail: normalizedNewEmail, sessionId: sessionId ?? null }),
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
      setError(payload?.error ?? "Não foi possível atualizar o e-mail.");
      setLoadingSave(false);
      return;
    }

    const updatedEmail = payload?.email ?? normalizedNewEmail;
    setCurrentEmail(updatedEmail);
    setMessage(`Pronto! Atualizamos seu e-mail.\n\nEnviamos uma nova confirmação para:\n${updatedEmail}`);
    setNewEmail("");
    setConfirmEmail("");
    setIsOpen(false);
    setLoadingSave(false);
  }

  return (
    <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-5 text-sm text-cyan-50">
      <h2 className="text-base font-semibold text-cyan-100">{title}</h2>
      <p className="mt-3">Enviamos a confirmação para:</p>
      <p className="break-all font-semibold">{currentEmail || "E-mail não identificado"}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        {allowResend ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={loadingResend || !currentEmail}
            className="rounded-xl bg-cyan-300 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-60"
          >
            {loadingResend ? "Enviando..." : "Reenviar e-mail"}
          </button>
        ) : null}

        {allowEmailEdit ? (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="rounded-xl border border-cyan-200/60 px-4 py-2 font-semibold text-cyan-100"
          >
            Digitei o e-mail errado
          </button>
        ) : null}
      </div>

      {message ? <p className="mt-4 whitespace-pre-line rounded-xl border border-emerald-300/40 bg-emerald-500/10 p-3 text-emerald-100">{message}</p> : null}
      {error ? <p className="mt-4 whitespace-pre-line rounded-xl border border-rose-300/40 bg-rose-500/10 p-3 text-rose-100">{error}</p> : null}

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-zinc-950 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Alterar e-mail</h3>
            <p className="mt-2 text-sm text-zinc-300">Digite o e-mail correto. Enviaremos uma nova confirmação automaticamente.</p>

            <div className="mt-4 space-y-3">
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Novo e-mail"
                className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white outline-none focus:border-cyan-300"
              />
              <input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="Confirmar novo e-mail"
                className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white outline-none focus:border-cyan-300"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveEmail}
                disabled={loadingSave}
                className="rounded-xl bg-cyan-300 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-60"
              >
                {loadingSave ? "Salvando..." : "Salvar novo e-mail"}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
