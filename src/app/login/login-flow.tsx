"use client";

import Link from "next/link";
import { useState } from "react";

export function LoginFlow({ redirectTo, error }: { redirectTo: string; error: string }) {
  const [email, setEmail] = useState("");

  const migratedAccountHref = email && email.includes("@")
    ? `/definir-senha-migrada?email=${encodeURIComponent(email.trim().toLowerCase())}`
    : "/definir-senha-migrada";

  return (
    <form action="/api/auth/login" method="post" className="mt-8 space-y-5">
      <input type="hidden" name="redirect" value={redirectTo} />

      <div>
        <label className="mb-2 block text-sm text-zinc-200">E-mail</label>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@email.com"
          autoComplete="email"
          className="h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition placeholder:text-zinc-500 focus:ring"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm text-zinc-200">Senha</label>
        <input
          name="password"
          type="password"
          required
          placeholder="Sua senha"
          autoComplete="current-password"
          className="h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition placeholder:text-zinc-500 focus:ring"
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 text-zinc-300">
          <input type="checkbox" name="remember" className="h-4 w-4 rounded border-white/30 bg-black/30" />
          Lembrar-me
        </label>
        <Link href="/recuperar-senha" className="text-cyan-200 hover:text-cyan-100">
          Esqueci minha senha
        </Link>
      </div>

      <Link
        href={migratedAccountHref}
        className="block rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-zinc-300 transition hover:border-cyan-300/30 hover:text-cyan-100"
      >
        Primeiro acesso ou conta migrada? Defina sua senha
      </Link>

      {error ? (
        <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
      ) : null}

      <button className="h-12 w-full rounded-2xl border border-cyan-300/40 bg-gradient-to-r from-cyan-400 to-violet-400 font-semibold text-zinc-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:brightness-110">
        Entrar
      </button>
    </form>
  );
}
