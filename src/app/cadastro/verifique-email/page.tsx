import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";

export default function VerifiqueEmailPage() {
  return (
    <PublicAppShell>
      <section className="px-4 pb-10">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur-2xl">
          <h1 className="text-2xl font-semibold">Confirme seu e-mail</h1>
          <p className="mt-3 text-sm text-zinc-300">Enviamos um link de confirmação para seu e-mail. Clique nele para ativar sua conta.</p>
          <p className="mt-3 text-sm text-zinc-400">Não encontrou? Verifique também sua caixa de spam ou lixo eletrônico.</p>
          <Link href="/login" className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl border border-cyan-300/50 bg-cyan-500/20 text-center">Voltar para login</Link>
        </div>
      </section>
    </PublicAppShell>
  );
}
