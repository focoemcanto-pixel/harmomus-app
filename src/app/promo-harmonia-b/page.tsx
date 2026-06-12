import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";

const CHECKOUT_URL = "https://harmonia.focoemcanto.com";

const BENEFITS = [
  "Aprenda a encontrar sua voz dentro da divisão vocal sem depender de tentativa e erro.",
  "Entenda como barítono, tenor, contralto e soprano se encaixam na prática.",
  "Tenha referências para estudar em casa e chegar mais seguro no ensaio.",
  "Desenvolva percepção harmônica para cantar com mais firmeza no ministério.",
];

const MODULES = [
  {
    title: "Base da harmonia vocal",
    text: "Você entende o papel de cada voz e para de cantar perdido quando a música abre em vozes.",
  },
  {
    title: "Divisão vocal na prática",
    text: "Exercícios e aplicações para reconhecer caminhos melódicos e sustentar sua linha com segurança.",
  },
  {
    title: "Ministério mais preparado",
    text: "Um método pensado para quem canta na igreja e precisa chegar no ensaio sabendo o que fazer.",
  },
];

const FAQ = [
  {
    question: "É para iniciantes?",
    answer: "Sim. A página foi pensada para vender o curso a pessoas que cantam no louvor, mas ainda travam quando precisam dividir vozes.",
  },
  {
    question: "Preciso saber teoria musical?",
    answer: "Não. A promessa central é prática: entender a função da sua voz e aplicar nos louvores.",
  },
  {
    question: "Essa página substitui a atual?",
    answer: "Não. Ela é uma variação para teste A/B e pode receber tráfego separado sem alterar a experiência principal do Harmomus.",
  },
];

export const metadata = {
  title: "Promo Harmonia | Teste B",
  description: "Página alternativa para teste A/B da oferta de harmonia vocal do Foco em Canto.",
};

export default function PromoHarmoniaBPage() {
  return (
    <PublicAppShell>
      <main className="relative overflow-hidden bg-[#05030a] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.24),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(217,70,239,0.22),transparent_34%),linear-gradient(180deg,#05030a_0%,#090514_48%,#04050a_100%)]" />

        <section className="relative mx-auto grid min-h-[calc(100vh-7rem)] w-full max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-[1.08fr_0.92fr] md:px-8 md:py-24">
          <div>
            <p className="inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">
              Curso Foco em Harmonia
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Pare de travar quando chega a hora de dividir vozes.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-zinc-200 md:text-xl">
              Aprenda harmonia vocal de um jeito simples, prático e aplicado ao louvor — para cantar sua voz com firmeza, percepção e segurança no ensaio.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={CHECKOUT_URL}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-7 py-4 text-center text-sm font-black uppercase tracking-[0.08em] text-slate-950 shadow-[0_20px_70px_rgba(34,211,238,0.35)] transition hover:scale-[1.02]"
              >
                Quero aprender harmonia
              </a>
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-7 py-4 text-center text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
              >
                Conhecer o Harmomus
              </Link>
            </div>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-2xl font-black text-cyan-200">100%</p>
                <p className="mt-1 text-xs text-zinc-300">Aplicado ao louvor</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-2xl font-black text-fuchsia-200">4 vozes</p>
                <p className="mt-1 text-xs text-zinc-300">Barítono, tenor, contralto e soprano</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-2xl font-black text-amber-200">Prático</p>
                <p className="mt-1 text-xs text-zinc-300">Para estudar e aplicar</p>
              </div>
            </div>
          </div>

          <aside className="relative rounded-[2rem] border border-white/15 bg-white/[0.07] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-7">
            <div className="absolute -right-5 -top-5 rounded-full bg-fuchsia-500 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-2xl">
              Teste B
            </div>
            <div className="rounded-[1.5rem] border border-cyan-300/25 bg-gradient-to-br from-cyan-500/20 via-fuchsia-500/10 to-black/20 p-6">
              <p className="text-sm uppercase tracking-[0.22em] text-cyan-100">Para quem canta no ministério</p>
              <h2 className="mt-4 text-3xl font-black">A divisão vocal deixa de ser um susto e vira direção.</h2>
              <ul className="mt-6 space-y-3">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex gap-3 text-sm leading-6 text-zinc-100">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200">✓</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-4 py-12 md:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {MODULES.map((module) => (
              <article key={module.title} className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
                <h3 className="text-xl font-bold text-white">{module.title}</h3>
                <p className="mt-3 text-sm leading-7 text-zinc-300">{module.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-5xl px-4 py-12 md:px-8">
          <div className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-500/12 to-fuchsia-500/12 p-6 md:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">Oferta direta</p>
            <h2 className="mt-3 text-3xl font-black md:text-5xl">Entre no curso e comece a estudar harmonia com direção.</h2>
            <p className="mt-4 text-base leading-8 text-zinc-200">
              Essa variação prioriza dor, clareza da transformação e chamada direta para compra — ideal para comparar contra uma página mais institucional.
            </p>
            <a
              href={CHECKOUT_URL}
              className="mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-white px-7 py-4 text-center text-sm font-black uppercase tracking-[0.08em] text-slate-950 transition hover:bg-cyan-100 sm:w-auto"
            >
              Acessar a oferta agora
            </a>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-5xl px-4 pb-20 pt-8 md:px-8">
          <h2 className="text-3xl font-black md:text-4xl">Dúvidas rápidas</h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((item) => (
              <article key={item.question} className="rounded-2xl border border-white/10 bg-white/[0.055] p-5">
                <h3 className="font-bold text-white">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-zinc-300">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
