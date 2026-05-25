import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminSettings } from "@/lib/data/admin-settings";
import { createClient } from "@/lib/supabase/server";

function normalizeRedirect(raw: string) {
  if (!raw || !raw.startsWith("/")) return "/";
  return raw;
}

function HarmomusLogo({ logoUrl, appName }: { logoUrl?: string; appName: string }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {logoUrl ? (
        <img src={logoUrl} alt={appName} className="h-16 w-auto object-contain" />
      ) : (
        <span className="text-3xl font-semibold tracking-tight text-white">{appName}</span>
      )}
    </div>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; redirect?: string }> }) {
  const params = await searchParams;
  const settings = await getAdminSettings();
  const redirectTo = normalizeRedirect(String(params.redirect ?? ""));
  const error = params.error ? decodeURIComponent(String(params.error)) : "";

  const appName = settings.branding.appName || "Harmomus";
  const logoUrl = settings.branding.logoUrl || "";
  const loginImageUrl = settings.branding.loginImageUrl || settings.branding.heroImageUrl || "";

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
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#17213a_0%,#07080f_42%,#020207_100%)] px-4 py-8 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.22),transparent_35%),radial-gradient(circle_at_20%_70%,rgba(34,211,238,0.14),transparent_32%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_0_100px_rgba(76,100,255,0.22)] backdrop-blur-2xl lg:grid-cols-[1fr_0.9fr]">
          <div className="hidden border-r border-white/10 p-10 lg:flex lg:flex-col lg:justify-between">
            <HarmomusLogo logoUrl={logoUrl} appName={appName} />
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200">Área de acesso</p>
              <h2 className="mt-4 max-w-xl text-5xl font-semibold leading-tight">Prepare sua voz. Honre seu chamado.</h2>
              <p className="mt-5 max-w-lg text-lg text-zinc-300">Entre para acessar seus kits vocais, playlists, favoritos e recursos exclusivos do Harmomus.</p>
            </div>
            <Link href="/" className="w-fit rounded-full border border-white/15 px-5 py-3 text-sm text-zinc-200 transition hover:bg-white/10">← Voltar para Home</Link>
          </div>

          <div className="relative overflow-hidden p-6 sm:p-10">
            {loginImageUrl ? <img src={loginImageUrl} alt={appName} className="absolute inset-0 h-full w-full object-cover opacity-15" /> : null}
            <div className="relative z-10">
              <div className="mb-8 lg:hidden"><HarmomusLogo logoUrl={logoUrl} appName={appName} /></div>
              <div className="mx-auto max-w-md">
                <p className="text-center text-sm text-zinc-300">Bem-vindo de volta</p>
                <h1 className="mt-2 text-center text-4xl font-semibold text-white">Entrar no {appName}</h1>
                <form action={signIn} className="mt-8 space-y-5">
                  <input type="hidden" name="redirect" value={redirectTo} />
                  <div>
                    <label className="mb-2 block text-sm text-zinc-200">E-mail</label>
                    <input name="email" type="email" required placeholder="voce@email.com" className="h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition placeholder:text-zinc-500 focus:ring" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-zinc-200">Senha</label>
                    <input name="password" type="password" required placeholder="Sua senha" className="h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition placeholder:text-zinc-500 focus:ring" />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <label className="flex items-center gap-2 text-zinc-300"><input type="checkbox" name="remember" className="h-4 w-4 rounded border-white/30 bg-black/30" />Lembrar-me</label>
                    <Link href="/recuperar-senha" className="text-cyan-200 hover:text-cyan-100">Esqueci minha senha</Link>
                  </div>
                  {error ? <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
                  <button className="h-12 w-full rounded-2xl border border-cyan-300/40 bg-gradient-to-r from-cyan-400 to-violet-400 font-semibold text-zinc-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:brightness-110">Entrar</button>
                </form>
                <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-sm text-zinc-300">
                  Ainda não tem conta? <Link href={`/cadastro?redirect=${encodeURIComponent(redirectTo)}`} className="font-semibold text-emerald-300 hover:text-emerald-200">Crie sua conta gratuitamente</Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
