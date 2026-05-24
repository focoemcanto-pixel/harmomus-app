import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { SignupPlanSelector } from "@/components/public/signup-plan-selector";
import { getAdminSettings } from "@/lib/data/admin-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PLAN_OPTIONS = ["free", "plus", "premium", "ministry_10"] as const;
type PlanSlug = (typeof PLAN_OPTIONS)[number];
type Field = "form" | "full_name" | "username" | "email" | "phone" | "password" | "confirm_password";

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
  return raw && raw.startsWith("/") ? raw : "";
}
function errorUrl(input: { plan: string; redirectTo: string; message: string; field: Field; fullName: string; username: string; email: string; phone: string }) {
  const params = new URLSearchParams({ plan: input.plan, redirect: input.redirectTo, error: input.message, field: input.field, full_name: input.fullName, username: input.username, email: input.email, phone: input.phone });
  return `/cadastro?${params.toString()}`;
}
function mapSupabaseError(message: string): { message: string; field: Field } {
  const lower = message.toLowerCase();
  if (lower.includes("already") || lower.includes("registered") || lower.includes("exists") || lower.includes("duplicate")) return { message: "Este e-mail já possui cadastro. Tente entrar ou recuperar a senha.", field: "email" };
  if (lower.includes("password") || lower.includes("senha")) return { message: "A senha precisa ter pelo menos 6 caracteres e ser mais segura.", field: "password" };
  if (lower.includes("email")) return { message: `Confira o e-mail informado e tente novamente. Detalhe: ${message}`, field: "email" };
  return { message: message || "Não foi possível criar a conta.", field: "form" };
}
function inputClass(name: Field, field: Field) {
  const base = "h-12 w-full rounded-2xl border bg-black/30 px-4 text-white outline-none ring-cyan-300/40 transition focus:ring";
  return name === field ? `${base} border-rose-400 ring-2 ring-rose-400/30` : `${base} border-white/20`;
}
function FieldError({ name, field, error }: { name: Field; field: Field; error: string }) {
  return name === field && error ? <p className="mt-2 text-xs font-medium text-rose-200">{error}</p> : null;
}
function HarmomusAuthLogo({ logoUrl, appName }: { logoUrl: string; appName: string }) {
  return (
    <div className="mx-auto mb-7 flex items-center justify-center gap-3">
      {logoUrl ? (
        <img src={logoUrl} alt={appName} className="max-h-16 w-auto object-contain" />
      ) : (
        <>
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-xl font-bold text-white shadow-[0_0_34px_rgba(129,140,248,0.25)]">H</div>
          <p className="text-3xl font-semibold tracking-tight text-white">Harmo<span className="bg-gradient-to-r from-indigo-200 to-violet-500 bg-clip-text text-transparent">mus</span></p>
        </>
      )}
    </div>
  );
}

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ plan?: string; redirect?: string; error?: string; field?: string; full_name?: string; username?: string; email?: string; phone?: string }> }) {
  const [params, settings] = await Promise.all([searchParams, getAdminSettings()]);
  const appName = settings.branding.appName || "Harmomus";
  const logoUrl = settings.branding.logoUrl || "";
  const loginImageUrl = settings.branding.loginImageUrl || settings.branding.heroImageUrl || "";
  const headline = settings.home.headline || "Prepare sua voz. Honre seu chamado.";
  const selectedPlan = (PLAN_OPTIONS.includes((params.plan ?? "").toLowerCase() as PlanSlug) ? (params.plan ?? "free").toLowerCase() : "free") as PlanSlug;
  const redirectPath = safeRedirect(String(params.redirect ?? ""));
  const error = params.error ? decodeURIComponent(params.error) : "";
  const field = (["form", "full_name", "username", "email", "phone", "password", "confirm_password"].includes(String(params.field ?? "")) ? String(params.field) : "form") as Field;
  const defaults = { fullName: String(params.full_name ?? ""), username: String(params.username ?? ""), email: String(params.email ?? ""), phone: String(params.phone ?? "") };

  async function signUp(formData: FormData) {
    "use server";
    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const username = slugifyUsername(String(formData.get("username") ?? ""));
    const phone = maskPhone(String(formData.get("phone") ?? ""));
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");
    const plan = String(formData.get("plan") ?? "free").toLowerCase() as PlanSlug;
    const redirectTo = safeRedirect(String(formData.get("redirect") ?? ""));
    const base = { plan, redirectTo, fullName, username, email, phone };
    const fail = (message: string, field: Field) => redirect(errorUrl({ ...base, message, field }));

    if (!PLAN_OPTIONS.includes(plan)) fail("Selecione um plano válido.", "form");
    if (!fullName) fail("Informe seu nome.", "full_name");
    if (!username) fail("Informe um nome de usuário válido.", "username");
    if (!email || !email.includes("@")) fail("Confira o e-mail informado e tente novamente.", "email");
    if (!phone || phone.replace(/\D/g, "").length < 10) fail("Informe um WhatsApp válido.", "phone");
    if (password.length < 6) fail("A senha precisa ter pelo menos 6 caracteres.", "password");
    if (password !== confirmPassword) fail("As senhas não conferem.", "confirm_password");

    const supabase = await createClient();
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, username, phone, plan_slug: plan },
    });
    const createdUserId = createdUser.user?.id ?? "";
    if (createError || !createdUserId) {
      const mapped = mapSupabaseError(createError?.message ?? "Não foi possível criar a conta.");
      fail(mapped.message, mapped.field);
    }

    const { error: profileError } = await (supabaseAdmin as any).from("profiles").upsert(
      { id: createdUserId, email, full_name: fullName, role: "user", updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    if (profileError) fail(`Conta criada, mas houve erro ao salvar perfil: ${profileError.message}`, "form");

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) {
      const mapped = mapSupabaseError(loginError.message);
      fail(`Conta criada, mas não foi possível iniciar sessão automaticamente. ${mapped.message}`, mapped.field);
    }

    if (plan === "free") redirect("/cadastro/sucesso?plan=free");
    redirect(`/api/billing/checkout?plan=${encodeURIComponent(plan)}&welcome=1`);
  }

  return (
    <PublicAppShell>
      <section className="relative overflow-hidden px-4 pb-10 pt-16 md:pt-8">
        {loginImageUrl ? <img src={loginImageUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-10" /> : null}
        <div className="relative mx-auto w-full max-w-2xl rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-6 shadow-[0_0_90px_rgba(119,78,255,0.25)] backdrop-blur-2xl md:p-8">
          <HarmomusAuthLogo logoUrl={logoUrl} appName={appName} />
          <h1 className="mt-2 text-center text-3xl font-semibold text-white md:text-4xl">Crie sua conta</h1>
          <p className="mt-2 text-center text-sm text-zinc-300">{headline}</p>
          <form action={signUp} className="mt-7 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="redirect" value={redirectPath} />
            <div className="md:col-span-2"><label className="mb-2 block text-sm text-zinc-200">Nome</label><input name="full_name" required defaultValue={defaults.fullName} className={inputClass("full_name", field)} /><FieldError name="full_name" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Nome de usuário</label><input name="username" required defaultValue={defaults.username} className={inputClass("username", field)} /><FieldError name="username" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">E-mail</label><input name="email" type="email" required defaultValue={defaults.email} className={inputClass("email", field)} /><FieldError name="email" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Telefone / WhatsApp</label><input name="phone" required defaultValue={defaults.phone} placeholder="(11) 99999-9999" className={inputClass("phone", field)} /><FieldError name="phone" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Senha</label><input name="password" type="password" required className={inputClass("password", field)} /><FieldError name="password" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Confirmar senha</label><input name="confirm_password" type="password" required className={inputClass("confirm_password", field)} /><FieldError name="confirm_password" field={field} error={error} /></div>
            {error && field === "form" ? <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 md:col-span-2">{error}</p> : null}
            <SignupPlanSelector initialPlan={selectedPlan} />
          </form>
          <p className="mt-5 text-center text-sm text-zinc-300">Já tem conta? <Link href="/login" className="text-cyan-200 hover:text-cyan-100">Entrar</Link></p>
        </div>
      </section>
    </PublicAppShell>
  );
}
