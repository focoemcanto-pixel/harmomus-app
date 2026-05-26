"use client";
import Link from "next/link";
import { useState } from "react";

export function LoginFlow({ redirectTo, error }: { redirectTo: string; error: string }) {
  const [email, setEmail] = useState("");
  const [showPasswordStep, setShowPasswordStep] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !email.includes("@")) return;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/migration/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as { migrated?: boolean };
      if (payload.migrated) {
        window.location.href = `/definir-senha-migrada?email=${encodeURIComponent(email)}`;
        return;
      }
      setShowPasswordStep(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action="/api/auth/login" method="post" className="mt-8 space-y-5" onSubmit={showPasswordStep ? undefined : handleContinue}>
      <input type="hidden" name="redirect" value={redirectTo} />
      <div>
        <label className="mb-2 block text-sm text-zinc-200">E-mail</label>
        <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" className="h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition placeholder:text-zinc-500 focus:ring" />
      </div>
      {showPasswordStep ? <div><label className="mb-2 block text-sm text-zinc-200">Senha</label><input name="password" type="password" required placeholder="Sua senha" className="h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition placeholder:text-zinc-500 focus:ring" /></div> : null}
      <div className="flex items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 text-zinc-300"><input type="checkbox" name="remember" className="h-4 w-4 rounded border-white/30 bg-black/30" />Lembrar-me</label>
        <Link href="/recuperar-senha" className="text-cyan-200 hover:text-cyan-100">Esqueci minha senha</Link>
      </div>
      {error ? <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      {showPasswordStep ? <button className="h-12 w-full rounded-2xl border border-cyan-300/40 bg-gradient-to-r from-cyan-400 to-violet-400 font-semibold text-zinc-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:brightness-110">Entrar</button> : <button disabled={loading} className="h-12 w-full rounded-2xl border border-cyan-300/40 bg-gradient-to-r from-cyan-400 to-violet-400 font-semibold text-zinc-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:brightness-110 disabled:opacity-70">{loading ? "Verificando..." : "Continuar"}</button>}
    </form>
  );
}
