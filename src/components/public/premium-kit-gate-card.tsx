type PremiumKitGateCardProps = {
  mode?: "guest" | "upgrade";
  reason?: "guest" | "free_limit" | "plan_hierarchy" | string;
  requiredPlan?: "plus" | "premium" | string | null;
  stats?: {
    accessCountToday?: number;
    limit?: number;
    nextResetAt?: string;
  } | null;
};

function formatResetTime(value?: string) {
  if (!value) return "em até 24 horas";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(value));
  } catch {
    return "em até 24 horas";
  }
}

function resolveGateContent({ mode, reason, requiredPlan, stats }: PremiumKitGateCardProps) {
  if (mode === "guest" || reason === "guest") {
    return {
      eyebrow: "Acesso restrito",
      icon: "🔐",
      title: "Entre para acessar este kit",
      description: "Para ouvir os áudios e continuar seu estudo no Harmomus, crie uma conta gratuita ou faça login.",
      primaryHref: "/cadastro?plan=free",
      primaryLabel: "Criar conta grátis",
      secondaryHref: "/login",
      secondaryLabel: "Já tenho conta",
      footer: "A conta gratuita libera sua entrada na plataforma e permite experimentar os kits disponíveis para o plano Free.",
    };
  }

  if (reason === "free_limit") {
    const used = stats?.accessCountToday ?? stats?.limit ?? 3;
    const limit = stats?.limit ?? 3;
    const resetAt = formatResetTime(stats?.nextResetAt);

    return {
      eyebrow: "Limite diário atingido",
      icon: "⏳",
      title: "Você atingiu seu limite diário de visitas",
      description: `Seu plano Free permite até ${limit} visitas válidas a kits a cada 24 horas. Você já utilizou ${used}/${limit} acessos disponíveis. Retorne após ${resetAt} ou faça upgrade para continuar estudando sem limites.`,
      primaryHref: "/assinar?plan=plus",
      primaryLabel: "Fazer upgrade",
      secondaryHref: "/biblioteca",
      secondaryLabel: "Voltar para biblioteca",
      footer: "Com Plus ou Premium você acessa a biblioteca sem limite diário.",
    };
  }

  const isPlus = requiredPlan === "plus";

  return {
    eyebrow: isPlus ? "Kit Plus" : "Kit Premium",
    icon: "🔒",
    title: isPlus ? "Kit exclusivo para assinantes Plus e Premium" : "Kit exclusivo para assinantes Premium",
    description: isPlus
      ? "Seu plano atual não inclui acesso a este conteúdo. Faça upgrade para desbloquear este kit e toda a biblioteca Plus."
      : "Este conteúdo faz parte da biblioteca Premium do Harmomus. Faça upgrade para acessar todos os kits, modulação inteligente e recursos avançados.",
    primaryHref: isPlus ? "/assinar?plan=plus" : "/assinar?plano=premium",
    primaryLabel: isPlus ? "Conhecer plano Plus" : "Assinar Premium",
    secondaryHref: "/assinar",
    secondaryLabel: "Comparar planos",
    footer: isPlus ? "O Premium também inclui todos os conteúdos do Plus." : "Premium libera a experiência completa do Harmomus.",
  };
}

export function PremiumKitGateCard(props: PremiumKitGateCardProps) {
  const content = resolveGateContent(props);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#161a2d_0%,#07090f_42%,#030407_100%)] px-4 py-8 text-white sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-10 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -right-20 top-24 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute bottom-8 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>

      <section className="relative mx-auto mt-4 w-full max-w-2xl rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 text-center shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-cyan-300/20 bg-cyan-300/10 text-4xl shadow-[0_0_35px_rgba(56,189,248,0.18)]">
          {content.icon}
        </div>

        <div className="mt-6 inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
          {content.eyebrow}
        </div>

        <h1 className="mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl">
          {content.title}
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-zinc-300">
          {content.description}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <a
            href={content.primaryHref}
            className="inline-flex items-center justify-center rounded-3xl border border-cyan-300/30 bg-gradient-to-r from-cyan-300/90 to-violet-400/90 px-5 py-4 text-sm font-bold text-slate-950 shadow-[0_8px_24px_rgba(56,189,248,0.32)] transition-all duration-300 hover:-translate-y-0.5"
          >
            {content.primaryLabel}
          </a>
          <a
            href={content.secondaryHref}
            className="inline-flex items-center justify-center rounded-3xl border border-white/20 bg-white/5 px-5 py-4 text-sm font-semibold text-zinc-100 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10"
          >
            {content.secondaryLabel}
          </a>
        </div>

        <p className="mx-auto mt-5 max-w-sm text-xs leading-relaxed text-zinc-500">
          {content.footer}
        </p>
      </section>
    </main>
  );
}
