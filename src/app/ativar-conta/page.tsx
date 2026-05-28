"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AtivarContaPage() {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/assinatura` },
    });
    setFeedback(error ? error.message : "Enviamos seu magic link para ativação da conta migrada.");
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h1 className="text-xl font-semibold text-zinc-100">Ativar conta migrada</h1>
        <p className="mt-2 text-sm text-zinc-400">Informe seu e-mail para receber link de acesso e recuperar a assinatura migrada.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100" placeholder="voce@email.com" />
          <button className="w-full rounded-md bg-violet-600 px-4 py-2 text-white">Enviar magic link</button>
        </form>
        {feedback && <p className="mt-3 text-sm text-zinc-300">{feedback}</p>}
      </div>
    </main>
  );
}
