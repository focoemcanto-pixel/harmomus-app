import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { createClient } from "@/lib/supabase/server";

function normalizeRedirect(raw: string) {
  if (!raw || !raw.startsWith("/")) return "/biblioteca";
  return raw;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; redirect?: string }> }) {
  const params = await searchParams;
  const redirectTo = normalizeRedirect(String(params.redirect ?? ""));
  const error = params.error ? decodeURIComponent(String(params.error)) : "";

  async function signIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const redirectPath = normalizeRedirect(String(formData.get("redirect") ?? ""));
    const supabase = await createClient();

    const { error: signInError, data } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      redirect(`/login?error=${encodeURIComponent("Credenciais inválidas. Tente novamente.")}&redirect=${encodeURIComponent(redirectPath)}`);
    }

    const user = data.user;

    if (user?.email) {
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("role")
        .ilike("email", user.email.trim().toLowerCase())
        .maybeSingle();

      if (String(profile?.role ?? "").trim().toLowerCase() === "admin") {
        redirect("/admin");
      }
    }

    redirect(redirectPath);
  }

  return (
    <PublicAppShell>
      <section className="px-4 pb-10">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-6 shadow-[0_0_80px_rgba(76,100,255,0.25)] backdrop-blur-2xl md:p-8">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/60 bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-lg font-bold tracking-wide">H</div>
          <p className="text-center text-sm text-zinc-300">Prepare sua voz. Honre seu chamado.</p>
          <h1 className="mt-2 text-center text-3xl font-semibold text-white">Entrar</h1>
          <form action={signIn} className="mt-6 space-y-4">
            <input type="hidden" name="redirect" value={redirectTo} />
            <div>
              <label className="mb-2 block text-sm text-zinc-200">E-mail</label>
              <input name="email" type="email" required placeholder="voce@email.com" className="h-11 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-white outline-none ring-cyan-300/40 transition focus:ring" />
            </div>
            <div>
              <label className="mb-2 block text-sm text-zinc-200">Senha</label>
              <input name="password" type="password" required placeholder="Sua senha" className="h-11 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-white outline-none ring-cyan-300/40 transition focus:ring" />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" name="remember" className="h-4 w-4 rounded border-white/30 bg-black/30" />Lembrar-me</label>
            {error ? <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
            <button className="h-11 w-full rounded-xl border border-cyan-300/50 bg-gradient-to-r from-cyan-500/30 to-violet-500/30 font-medium text-white transition hover:brightness-110">Entrar</button>
          </form>
          <div className="mt-5 flex items-center justify-between text-sm">
            <Link href="/recuperar-senha" className="text-cyan-200 hover:text-cyan-100">Esqueci minha senha</Link>
            <Link href={`/cadastro?redirect=${encodeURIComponent(redirectTo)}`} className="text-violet-200 hover:text-violet-100">Criar conta grátis</Link>
          </div>
        </div>
      </section>
    </PublicAppShell>
  );
}
