import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default function LoginPage() {
  async function signIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) redirect(`/login?error=${encodeURIComponent("Credenciais inválidas. Tente novamente.")}`);
    redirect('/biblioteca');
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 flex items-center justify-center">
      <form action={signIn} className="w-full max-w-md rounded-2xl border border-white/10 bg-surface/80 p-6">
        <h1 className="text-2xl text-white font-semibold">Entrar no Harmomus</h1>
        <div className="mt-4 space-y-3">
          <input name="email" type="email" required placeholder="Email" className="w-full rounded-lg bg-black/30 border border-white/20 p-3 text-white" />
          <input name="password" type="password" required placeholder="Senha" className="w-full rounded-lg bg-black/30 border border-white/20 p-3 text-white" />
          <button className="w-full rounded-lg border border-gold-400/50 py-2 text-gold-300">Entrar</button>
        </div>
      </form>
    </main>
  );
}
