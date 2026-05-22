import Link from "next/link";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { createClient } from "@/lib/supabase/server";

export default function RecuperarSenhaPage() {
  async function sendReset(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email);
  }

  return <PublicAppShell><section className="px-4 pb-10"><div className="mx-auto w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur-2xl"><h1 className="text-2xl font-semibold">Recuperar senha</h1><p className="mt-2 text-sm text-zinc-300">Informe seu e-mail e enviaremos um link para redefinir sua senha.</p><form action={sendReset} className="mt-5 space-y-4"><input name="email" type="email" required className="h-11 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-white" placeholder="voce@email.com" /><button className="h-11 w-full rounded-xl border border-cyan-300/50 bg-cyan-500/20">Enviar link de recuperação</button></form><p className="mt-4 text-sm text-zinc-300">Lembrou sua senha? <Link href="/login" className="text-cyan-200">Voltar ao login</Link></p></div></section></PublicAppShell>;
}
