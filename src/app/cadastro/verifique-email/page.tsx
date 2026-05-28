import Link from "next/link";

import { EmailConfirmationState } from "@/components/auth/email-confirmation-state";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams?: Promise<{ email?: string }> | { email?: string };
};

export default async function VerifiqueEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = String(data.user?.email ?? params?.email ?? "").trim().toLowerCase();
  return (
    <PublicAppShell>
      <section className="px-4 pb-10">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur-2xl">
          <h1 className="text-2xl font-semibold">Confirme seu e-mail</h1>
          <div className="mt-4">
            <EmailConfirmationState variant="free" email={email} allowEmailEdit allowResend />
          </div>
          <Link href="/login" className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl border border-cyan-300/50 bg-cyan-500/20 text-center">Voltar para login</Link>
        </div>
      </section>
    </PublicAppShell>
  );
}
