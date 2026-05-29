import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { SignupPlanSelector } from "@/components/public/signup-plan-selector";
import { getAdminSettings } from "@/lib/data/admin-settings";

const PLAN_OPTIONS = ["free", "plus", "premium", "ministry_10", "ministry_20", "ministry_40"] as const;
type PlanSlug = (typeof PLAN_OPTIONS)[number];
type Field = "form" | "full_name" | "username" | "email" | "phone" | "password" | "confirm_password";

function safeRedirect(raw: string) {
  return raw && raw.startsWith("/") ? raw : "";
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
    <div className="mx-auto mb-8 flex min-h-[76px] items-center justify-center gap-3">
      {logoUrl ? (
        <img src={logoUrl} alt={appName} className="h-20 max-h-20 w-auto max-w-[320px] object-contain md:h-24 md:max-h-24 md:max-w-[420px]" />
      ) : (
        <>
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-2xl font-bold text-white shadow-[0_0_34px_rgba(129,140,248,0.25)]">H</div>
          <p className="text-4xl font-semibold tracking-tight text-white">Harmo<span className="bg-gradient-to-r from-indigo-200 to-violet-500 bg-clip-text text-transparent">mus</span></p>
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
  const redirectPath = safeRedirect(String(params.redirect ?? ""));
  const isMinistryInviteSignup = redirectPath.startsWith("/convite-ministerio/");
  const selectedPlan = isMinistryInviteSignup
    ? "free"
    : (PLAN_OPTIONS.includes((params.plan ?? "").toLowerCase() as PlanSlug) ? (params.plan ?? "free").toLowerCase() : "free") as PlanSlug;

  let error = params.error ? decodeURIComponent(params.error) : "";

  if (error.includes("For security purposes")) {
    error = "Você tentou novamente muito rápido. Aguarde alguns segundos e tente novamente.";
  }

  const field = (["form", "full_name", "username", "email", "phone", "password", "confirm_password"].includes(String(params.field ?? "")) ? String(params.field) : "form") as Field;
  const defaults = { fullName: String(params.full_name ?? ""), username: String(params.username ?? ""), email: String(params.email ?? ""), phone: String(params.phone ?? "") };

  return (
    <PublicAppShell>
      <section className="relative overflow-hidden px-4 pb-10 pt-16 md:pt-8">
        {loginImageUrl ? <img src={loginImageUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-10" /> : null}
        <div className="relative mx-auto w-full max-w-2xl rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-6 shadow-[0_0_90px_rgba(119,78,255,0.25)] backdrop-blur-2xl md:p-8">
          <HarmomusAuthLogo logoUrl={logoUrl} appName={appName} />
          <div className="mx-auto max-w-xl text-center">
            {isMinistryInviteSignup ? (
              <div className="mb-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                Convite Ministerial Premium
              </div>
            ) : null}
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">
              {isMinistryInviteSignup ? "Crie sua conta para ativar o convite" : "Crie sua conta"}
            </h1>
            <p className="mt-2 text-sm text-zinc-300">
              {isMinistryInviteSignup
                ? "Você não precisa escolher plano nem pagar nada. Sua vaga Premium será vinculada ao ministério após o aceite do convite."
                : headline}
            </p>
          </div>
          <form action="/api/auth/signup" method="post" className="mt-7 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="redirect" value={redirectPath} />
            {isMinistryInviteSignup ? <input type="hidden" name="plan" value="free" /> : null}
            <div className="md:col-span-2"><label className="mb-2 block text-sm text-zinc-200">Nome</label><input name="full_name" required defaultValue={defaults.fullName} className={inputClass("full_name", field)} /><FieldError name="full_name" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Nome de usuário</label><input name="username" required defaultValue={defaults.username} className={inputClass("username", field)} /><FieldError name="username" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">E-mail</label><input name="email" type="email" required defaultValue={defaults.email} readOnly={isMinistryInviteSignup && Boolean(defaults.email)} className={`${inputClass("email", field)} ${isMinistryInviteSignup && defaults.email ? "cursor-not-allowed opacity-80" : ""}`} /><FieldError name="email" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Telefone / WhatsApp</label><input name="phone" required defaultValue={defaults.phone} placeholder="(11) 99999-9999" className={inputClass("phone", field)} /><FieldError name="phone" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Senha</label><input name="password" type="password" required className={inputClass("password", field)} /><FieldError name="password" field={field} error={error} /></div>
            <div><label className="mb-2 block text-sm text-zinc-200">Confirmar senha</label><input name="confirm_password" type="password" required className={inputClass("confirm_password", field)} /><FieldError name="confirm_password" field={field} error={error} /></div>

            {error && field === "form" ? (
              <div className="rounded-2xl border border-rose-400/30 bg-gradient-to-r from-rose-500/15 to-red-500/10 px-4 py-4 text-sm text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.12)] md:col-span-2">
                <p className="font-semibold">Ops! Não conseguimos continuar.</p>
                <p className="mt-1 text-rose-100/90">{error}</p>
              </div>
            ) : null}

            {isMinistryInviteSignup ? (
              <>
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-50 md:col-span-2">
                  Ao criar sua conta, você será enviado para a página do convite para concluir a ativação do acesso Premium Ministerial.
                </div>
                <button type="submit" className="h-13 rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-400 px-5 py-4 text-base font-extrabold text-slate-950 shadow-[0_0_34px_rgba(103,232,249,0.22)] transition hover:brightness-110 md:col-span-2">
                  Criar conta e ativar convite
                </button>
              </>
            ) : (
              <>
                <SignupPlanSelector initialPlan={selectedPlan} />
                <button type="submit" className="h-13 rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-400 px-5 py-4 text-base font-extrabold text-slate-950 shadow-[0_0_34px_rgba(103,232,249,0.22)] transition hover:brightness-110 md:col-span-2">
                  Criar conta
                </button>
              </>
            )}
          </form>
          <p className="mt-5 text-center text-sm text-zinc-300">Já tem conta? <Link href={`/login${redirectPath ? `?redirect=${encodeURIComponent(redirectPath)}` : ""}`} className="text-cyan-200 hover:text-cyan-100">Entrar</Link></p>
        </div>
      </section>
    </PublicAppShell>
  );
}
