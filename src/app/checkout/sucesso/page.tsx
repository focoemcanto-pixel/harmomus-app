const WHATSAPP_PREMIUM_URL = "https://chat.whatsapp.com/FNU6Xl5t6qD0VfGA2EQ0IW?mode=gi_t";

export default function CheckoutSucesso() {
  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-emerald-500/30 bg-zinc-900/90 p-8 shadow-2xl md:p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Onboarding Premium</p>
        <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Bem-vindo(a) ao Harmomus Plus/Premium 🎉</h1>
        <p className="mt-4 text-zinc-300">Seu pagamento foi confirmado e os recursos premium já estão liberados na sua conta.</p>

        <div className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-5">
          <h2 className="text-lg font-semibold text-emerald-200">Benefícios liberados agora</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>• Acesso completo ao conteúdo do seu plano.</li>
            <li>• Playlists e funcionalidades premium disponíveis imediatamente.</li>
            <li>• Gerenciamento de cobrança direto pelo Stripe Portal.</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href={WHATSAPP_PREMIUM_URL} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">Entrar no Grupo Premium</a>
          <a href="/biblioteca" className="rounded-xl border border-zinc-600 px-5 py-3 text-sm font-semibold text-zinc-100">Explorar catálogo</a>
          <a href="/assinatura" className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100">Gerenciar assinatura</a>
        </div>
      </div>
    </main>
  );
}
