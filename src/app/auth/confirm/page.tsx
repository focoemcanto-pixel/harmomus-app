"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

function getFriendlyError(raw: string | null) {
  const value = String(raw ?? "").toLowerCase();

  if (value.includes("otp_expired") || value.includes("expired") || value.includes("link is invalid")) {
    return "Este link de confirmação expirou ou já foi usado. Volte para a tela anterior e clique em reenviar e-mail.";
  }

  if (value.includes("access_denied")) {
    return "Não foi possível confirmar seu e-mail com este link. Solicite um novo e-mail de confirmação.";
  }

  return "Não foi possível confirmar seu e-mail agora. Solicite um novo e-mail de confirmação.";
}

export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Confirmando seu e-mail...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function confirmFromHash() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryParams = new URLSearchParams(window.location.search);
      const hashError = hashParams.get("error") || hashParams.get("error_code") || hashParams.get("error_description");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (hashError) {
        if (!isMounted) return;
        setError(getFriendlyError(hashError));
        setStatus("Link de confirmação inválido");
        window.history.replaceState(null, "", "/auth/confirm");
        return;
      }

      if (!accessToken || !refreshToken) {
        if (!isMounted) return;
        setError("Link de confirmação incompleto. Solicite um novo e-mail de confirmação.");
        setStatus("Não foi possível confirmar");
        return;
      }

      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        if (!isMounted) return;
        setError(getFriendlyError(sessionError.message));
        setStatus("Não foi possível confirmar");
        window.history.replaceState(null, "", "/auth/confirm");
        return;
      }

      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;

      if (userId) {
        await (supabase as any)
          .from("profiles")
          .update({
            onboarding_status: "email_confirmed",
            onboarding_step: "waiting_first_login",
          })
          .eq("id", userId);
      }

      window.history.replaceState(null, "", "/auth/confirm");
      const next = queryParams.get("next") || "/login?confirmed=1";
      router.replace(next);
    }

    confirmFromHash();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto mt-20 max-w-lg rounded-3xl border border-cyan-400/30 bg-zinc-900 p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Harmomus</p>
        <h1 className="mt-3 text-3xl font-semibold">{status}</h1>

        {error ? (
          <>
            <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/login" className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-zinc-950">
                Ir para login
              </Link>
              <Link href="/cadastro" className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-100">
                Criar conta novamente
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-zinc-300">Aguarde alguns segundos. Estamos validando seu acesso com segurança.</p>
        )}
      </div>
    </main>
  );
}
