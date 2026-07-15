import { PublicAppShell } from "@/components/public/public-app-shell";

type ResetPasswordSearchParams = Promise<{
  error?: string;
  migration?: string;
  token_hash?: string;
  type?: string;
}>;

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: ResetPasswordSearchParams;
}) {
  const params = await searchParams;
  const error = params?.error ?? "";
  const migration = params?.migration === "1";
  const tokenHash = params?.token_hash ?? "";
  const hasRecoveryToken = Boolean(tokenHash && params?.type === "recovery");

  return (
    <PublicAppShell>
      <section className="px-4 pb-10">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur-2xl">
          <h1 className="text-2xl font-semibold">Definir nova senha</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Digite sua nova senha para concluir a recuperação.
          </p>

          {error ? (
            <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          {!hasRecoveryToken && !migration && !error ? (
            <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Este link não contém um token de recuperação válido. Solicite um novo link.
            </p>
          ) : null}

          <form action="/api/auth/password/update" method="post" className="mt-5 space-y-4">
            <input type="hidden" name="migration" value={migration ? "1" : "0"} />
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className="h-11 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-white"
              placeholder="Nova senha"
            />
            <input
              name="confirm_password"
              type="password"
              required
              minLength={6}
              className="h-11 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-white"
              placeholder="Confirmar nova senha"
            />
            <button
              disabled={!hasRecoveryToken && !migration}
              className="h-11 w-full rounded-xl border border-cyan-300/50 bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Salvar nova senha
            </button>
          </form>
        </div>
      </section>
    </PublicAppShell>
  );
}
