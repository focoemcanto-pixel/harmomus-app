import type { Metadata } from "next";
import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";

export const metadata: Metadata = {
  title: "Instalar Harmomus",
  description: "Tutorial para instalar o Harmomus como aplicativo no Android e iPhone.",
};

const ANDROID_STEPS = [
  "Abra o Harmomus pelo Google Chrome no seu celular.",
  "Toque nos três pontinhos (⋮) no canto superior da tela.",
  "Escolha a opção Adicionar à tela inicial ou Instalar app.",
  "Confirme o nome Harmomus e toque em Adicionar.",
];

const IPHONE_STEPS = [
  "Abra o Harmomus pelo Safari no iPhone.",
  "Toque no botão de compartilhar, aquele quadrado com uma seta para cima.",
  "Role as opções e toque em Adicionar à Tela de Início.",
  "Confirme o nome Harmomus e toque em Adicionar.",
];

function TutorialCard({
  icon,
  title,
  subtitle,
  steps,
}: {
  icon: string;
  title: string;
  subtitle: string;
  steps: string[];
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/15 bg-white/[0.04] p-5 shadow-[0_25px_80px_rgba(8,145,178,0.14)] md:p-7">
      <div className="flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-3xl">
          {icon}
        </div>
        <div>
          <h2 className="text-2xl font-black text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{subtitle}</p>
        </div>
      </div>

      <ol className="mt-6 space-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-zinc-100">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-300 text-xs font-black text-slate-950">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function InstalarPage() {
  return (
    <PublicAppShell>
      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-16 pt-8 md:px-8">
        <section className="relative overflow-hidden rounded-[2.2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.20),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.22),transparent_34%),linear-gradient(145deg,#030712,#070d1f_52%,#09051a)] p-6 text-center shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
          <div className="mx-auto mb-6 grid h-24 w-24 place-items-center rounded-[2rem] border border-white/15 bg-white/10 text-5xl shadow-[0_0_60px_rgba(34,211,238,0.18)]">
            📱
          </div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-200">Acesso rápido no celular</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-black leading-tight text-white md:text-6xl">
            Instale o Harmomus como aplicativo
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-200 md:text-lg">
            Coloque o Harmomus na tela inicial do Android ou iPhone e acesse seus kits, estudos e playlists com apenas um toque.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/biblioteca" className="inline-flex h-13 min-w-[210px] items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-300 to-violet-400 px-6 py-4 text-sm font-black text-slate-950 transition hover:brightness-110">
              Abrir biblioteca
            </Link>
            <Link href="/" className="inline-flex h-13 min-w-[210px] items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-sm font-semibold text-white transition hover:bg-white/10">
              Voltar para Home
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-400/10 p-5 md:p-6">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Android / Chrome</p>
            <h2 className="mt-2 text-xl font-black text-white">Procure pelo botão nativo</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-200">
              Em alguns aparelhos Android, o Chrome mostra automaticamente um botão ou aviso de &quot;Instalar aplicativo&quot;. Se ele aparecer, toque nele para instalar em poucos segundos.
            </p>
          </div>
          <div className="rounded-[2rem] border border-violet-300/20 bg-violet-400/10 p-5 md:p-6">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200">iPhone / Safari</p>
            <h2 className="mt-2 text-xl font-black text-white">Use Compartilhar → Adicionar à Tela de Início</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-200">
              No iPhone, abra pelo Safari, toque em Compartilhar e escolha &quot;Adicionar à Tela de Início&quot; para criar o atalho do Harmomus.
            </p>
          </div>
        </section>

        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50">
          No iPhone, abra pelo Safari. No Chrome do iPhone, a instalação pode não aparecer.
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <TutorialCard
            icon="🤖"
            title="Android"
            subtitle="Use o Google Chrome para transformar o Harmomus em um app na tela inicial."
            steps={ANDROID_STEPS}
          />
          <TutorialCard
            icon="🍎"
            title="iPhone"
            subtitle="No iPhone, o atalho deve ser criado pelo Safari para funcionar da forma correta."
            steps={IPHONE_STEPS}
          />
        </div>

        <section className="rounded-[2rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-emerald-50 md:p-7">
          <h2 className="text-xl font-black text-white">Depois de instalar</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-50/90 md:text-base">
            O ícone do Harmomus aparecerá junto com seus outros aplicativos. Sempre que quiser estudar, basta tocar nele e entrar normalmente com sua conta.
          </p>
        </section>
      </main>
    </PublicAppShell>
  );
}
