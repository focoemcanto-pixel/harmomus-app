import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";

type RecuperarSenhaPageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

export default async function RecuperarSenhaPage({ searchParams }: RecuperarSenhaPageProps) {
  const params = await searchParams;
  const success = params?.success === "1";
  const error = params?.error ?? "";

  return (
    <PublicAppShell>
      <section className="px-4 pb-10">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur-2xl">
          <h1 className="text-2xl font-semibold">Recuperar senha</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Informe seu e-mail e enviaremos um link para redefinir sua senha.
          </p>

          {success ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-4 text-emerald-100">
              <p className="font-semibold">Link enviado!</p>
              <p className="mt-1 text-sm text-emerald-50/90">
                Confira sua caixa de entrada e também a pasta de spam. Use sempre o e-mail mais recente recebido.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {decodeURIComponent(error)}
            </p>
          ) : null}

          {!success ? (
            <form action="/api/auth/password/reset" method="post" className="mt-5 space-y-4">
              <input
                name="email"
                type="email"
                required
                className="h-11 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-white"
                placeholder="voce@email.com"
              />
              <button className="h-11 w-full rounded-xl border border-cyan-300/50 bg-cyan-500/20">
                Enviar link de recuperação
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="mt-5 flex h-11 w-full items-center justify-center rounded-xl border border-cyan-300/50 bg-cyan-500/20 text-center"
            >
              Voltar ao login
            </Link>
          )}

          {!success ? (
            <p className="mt-4 text-sm text-zinc-300">
              Lembrou sua senha?{" "}
              <Link href="/login" className="text-cyan-200">
                Voltar ao login
              </Link>
            </p>
          ) : null}
        </div>
      </section>
    </PublicAppShell>
  );
}
