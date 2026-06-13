import Link from "next/link";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  searchParams?: Promise<{ code?: string }> | { code?: string };
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function confirmEmail(code: string) {
  const admin = createSupabaseAdminClient() as any;
  const value = String(code ?? "").trim();
  if (!value) throw new Error("Link inválido.");

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,email,pending_email,email_confirmation_code,email_confirmation_expires_at")
    .eq("email_confirmation_code", value)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile?.id) throw new Error("Link inválido ou já utilizado.");

  const expiresAt = new Date(profile.email_confirmation_expires_at ?? "").getTime();
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    throw new Error("Este link expirou. Envie uma nova confirmação pelo perfil.");
  }

  const email = normalizeEmail(profile.pending_email) || normalizeEmail(profile.email);
  if (!email) throw new Error("E-mail não encontrado.");

  const now = new Date().toISOString();
  const { error: authError } = await admin.auth.admin.updateUserById(profile.id, {
    email,
    email_confirm: true,
  });
  if (authError) throw new Error(authError.message);

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      email,
      pending_email: null,
      email_verified_at: now,
      email_confirmation_code: null,
      email_confirmation_expires_at: null,
      onboarding_status: "active",
      onboarding_step: "completed",
      updated_at: now,
    })
    .eq("id", profile.id);

  if (updateError) throw new Error(updateError.message);
  return email;
}

export default async function ConfirmarEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  let email = "";
  let error = "";

  try {
    email = await confirmEmail(String(params?.code ?? ""));
  } catch (err) {
    error = err instanceof Error ? err.message : "Não foi possível confirmar seu e-mail.";
  }

  const success = Boolean(email && !error);

  return (
    <main className="min-h-screen bg-[#06080d] px-4 py-10 text-white">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-xl place-items-center">
        <div className={`w-full rounded-[2rem] border p-8 text-center shadow-[0_0_90px_rgba(34,211,238,0.12)] ${success ? "border-emerald-300/25 bg-emerald-400/10" : "border-yellow-300/25 bg-yellow-400/10"}`}>
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/10 text-4xl">
            {success ? "✓" : "!"}
          </div>
          <h1 className="mt-6 text-3xl font-black">
            {success ? "E-mail confirmado" : "Não foi possível confirmar"}
          </h1>
          <p className="mt-3 text-zinc-200">
            {success ? `O e-mail ${email} foi confirmado com sucesso.` : error}
          </p>
          <Link href="/perfil" className="mt-8 inline-flex rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-6 py-4 text-sm font-black uppercase tracking-[0.12em] text-black">
            Voltar ao perfil
          </Link>
        </div>
      </section>
    </main>
  );
}
