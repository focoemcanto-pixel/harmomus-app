import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { SignupPlanSelector } from "@/components/public/signup-plan-selector";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PLAN_OPTIONS = ["free", "plus", "premium"] as const;
type PlanSlug = (typeof PLAN_OPTIONS)[number];

function slugifyUsername(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function safeRedirect(raw: string) {
  if (!raw || !raw.startsWith("/")) return "";
  return raw;
}

function signupErrorUrl(plan: string, redirectTo: string, message: string) {
  return `/cadastro?plan=${encodeURIComponent(plan)}&redirect=${encodeURIComponent(redirectTo)}&error=${encodeURIComponent(message)}`;
}

function friendlySignupError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("already") || lower.includes("registered") || lower.includes("exists")) return "Este e-mail já possui cadastro. Tente entrar ou recuperar a senha.";
  if (lower.includes("password") || lower.includes("senha")) return "A senha precisa atender aos requisitos mínimos. Tente uma senha maior e mais segura.";
  if (lower.includes("email")) return "Confira o e-mail informado e tente novamente.";
  return message || "Não foi possível criar a conta.";
}

function HarmomusAuthLogo() {
  return (
    <div className="mx-auto mb-7 flex items-center justify-center gap-3">
      <div className="relative h-12 w-12 rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_0_34px_rgba(129,140,248,0.25)]">
        <svg viewBox="0 0 64 64" className="h-full w-full overflow-visible p-2" aria-hidden="true">
          <path d="M10 43 C20 30, 23 18, 30 8" stroke="#f8fbff" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M18 49 C28 37, 34 25, 44 15" stroke="#a8b1ff" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M27 53 C37 42, 43 33, 55 26" stroke="#6d5df6" strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="50" cy="13" r="5" fill="#f8fbff" />
        </svg>
      </div>
      <div className="text-left">
        <p className="text-3xl font-semibold tracking-tight text-white">Harmo<span className="bg-gradient-to-r from-indigo-200 to-violet-500 bg-clip-text text-transparent">mus</span></p>
      </div>
    </div>
  );
}

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ plan?: string; redirect?: string; error?: string }> }) {
  const params = await searchParams;
  const selectedPlan = (PLAN_OPTIONS.includes((params.plan ?? "").toLowerCase() as PlanSlug) ? (params.plan ?? "free").toLowerCase() : "free") as PlanSlug;
  const redirectPath = safeRedirect(String(params.redirect ?? ""));
  const error = params.error ? decodeURIComponent(params.error) : "";

  async function signUp(formData: FormData) {
    "use server";
    const full_name = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const username = slugifyUsername(String(formData.get("username") ?? ""));
    const phone = maskPhone(String(formData.get("phone") ?? ""));
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");
    const plan = String(formData.get("plan") ?? "free").toLowerCase() as PlanSlug;
    const redirectTo = safeRedirect(String(formData.get("redirect") ?? ""));

    if (!PLAN_OPTIONS.includes(plan) || !full_name || !email || !username || password !== confirmPassword) {
      redirect(signupErrorUrl(plan, redirectTo, "Confira os dados e tente novamente."));
    }

    const supabase = await createClient();
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: existingUsername } = await (supabaseAdmin as any).from("profiles").select("id").eq("username", username).maybeSingle();
    if (existingUsername) {
      redirect(signupErrorUrl(plan, redirectTo, "Nome de usuário já está em uso."));
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name, username, phone, plan_slug: plan } },
    });

    if (signUpError || !signUpData.user) {
      redirect(signupErrorUrl(plan, redirectTo, friendlySignupError(signUpError?.message ?? "Não foi possível criar a conta.")));
    }

    const { error: profileError } = await (supabaseAdmin as any).from("profiles").upsert(
      { id: signUpData.user.id, email, full_name, username, phone, role: "user", plan_slug: plan, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

    if (profileError) {
      redirect(signupErrorUrl(plan, redirectTo, `Conta criada, mas houve erro ao salvar perfil: ${profileError.message}`));
    }

    if (plan === "free") {
      redirect(redirectTo || "/perfil");
    }

    redirect(`/api/billing/checkout?plan=${encodeURIComponent(plan)}`);
  }

  return (
    <PublicAppShell>
      <section className="px-4 pb-10 pt-16 md:pt-8">
        <div className="mx-auto w-full max-w-2xl rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-6 shadow-[0_0_90px_rgba(119,78,255,0.25)] backdrop-blur-2xl md:p-8">
          <HarmomusAuthLogo />
          <h1 className="mt-2 text-center text-3xl font-semibold text-white md:text-4xl">Crie sua conta</h1>
          <p className="mt-2 text-center text-sm text-zinc-300">Prepare sua voz. Honre seu chamado.</p>

          <form action={signUp} className="mt-7 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="redirect" value={redirectPath} />
            <div className="md:col-span-2"><label className="mb-2 block text-sm text-zinc-200">Nome</label><input name="full_name" required className="h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition focus:ring" /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Nome de usuário</label><input name="username" required className="h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition focus:ring" /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">E-mail</label><input name="email" type="email" required className="h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition focus:ring" /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Telefone / WhatsApp</label><input name="phone" required placeholder="(11) 99999-9999" className="h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition focus:ring" /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Senha</label><input name="password" type="password" required className="h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition focus:ring" /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Confirmar senha</label><input name="confirm_password" type="password" required className="h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition focus:ring" /></div>
            {error ? <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 md:col-span-2">{error}</p> : null}
            <SignupPlanSelector initialPlan={selectedPlan} />
          </form>
          <p className="mt-5 text-center text-sm text-zinc-300">Já tem conta? <Link href="/login" className="text-cyan-200 hover:text-cyan-100">Entrar</Link></p>
        </div>
      </section>
    </PublicAppShell>
  );
}
