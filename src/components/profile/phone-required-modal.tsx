"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "harmomus_phone_prompt_dismissed_date";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatPhoneBR(value: string) {
  const digits = onlyDigits(value).replace(/^55/, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidPhone(value: string) {
  const digits = onlyDigits(value);
  const withoutCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  return withoutCountry.length === 10 || withoutCountry.length === 11;
}

export function PhoneRequiredModal() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let canceled = false;

    async function checkPhoneStatus() {
      try {
        if (window.localStorage.getItem(DISMISS_KEY) === todayKey()) return;

        const response = await fetch("/api/profile/phone/status", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload = await response.json().catch(() => null);
        if (!canceled && payload?.authenticated && payload?.requiresPhoneUpdate) {
          setOpen(true);
        }
      } catch {
        // Não bloqueia navegação caso a checagem falhe.
      }
    }

    checkPhoneStatus();
    return () => {
      canceled = true;
    };
  }, []);

  const dismissToday = () => {
    window.localStorage.setItem(DISMISS_KEY, todayKey());
    setOpen(false);
  };

  const savePhone = async () => {
    if (!isValidPhone(phone)) {
      setError("Informe um WhatsApp válido com DDD.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(String(payload?.error ?? "Não foi possível salvar seu telefone."));
      }

      window.localStorage.removeItem(DISMISS_KEY);
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar seu telefone.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-white/15 bg-[#0b1020] p-6 text-white shadow-[0_25px_90px_rgba(0,0,0,0.45)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Atualização de cadastro</p>
        <h2 className="mt-3 text-2xl font-semibold">Atualize seu WhatsApp</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          Queremos manter você informado sobre novidades do Harmomus, avisos importantes da sua assinatura e atualizações da plataforma.
        </p>

        <label className="mt-5 block text-sm text-zinc-200">
          WhatsApp
          <input
            value={phone}
            onChange={(event) => setPhone(formatPhoneBR(event.target.value))}
            placeholder="(00) 00000-0000"
            inputMode="tel"
            autoFocus
            className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
          />
        </label>

        {error ? <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}

        <button
          type="button"
          onClick={savePhone}
          disabled={saving}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-4 text-sm font-bold text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar telefone"}
        </button>
        <button
          type="button"
          onClick={dismissToday}
          disabled={saving}
          className="mt-3 w-full rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
        >
          Lembrar amanhã
        </button>
      </div>
    </div>
  );
}
