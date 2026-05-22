import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getPlans } from "@/lib/data/plans";
import { getPublishedKits } from "@/lib/data/public-kits";

export const revalidate = 300;

const TESTIMONIALS = [
  {
    name: "Ana Rodrigues",
    role: "Líder de louvor • Igreja Verbo da Vida",
    text: "Com o Harmomus, meu time chegou no ensaio muito mais preparado. Os tons e vozes já prontos diminuíram retrabalho e elevaram o nível da ministração.",
    avatar: "AR",
  },
  {
    name: "Daniel Martins",
    role: "Diretor musical • Ministério Rio Worship",
    text: "A plataforma virou nosso streaming vocal diário. Encontramos kits novos toda semana, com acabamento profissional para cada voz da equipe.",
    avatar: "DM",
  },
  {
    name: "Carla Prado",
    role: "Cantora • Comunidade da Graça",
    text: "Antes eu perdia horas procurando referência. Agora entro, escolho a música e estudo com confiança. A experiência é realmente premium.",
    avatar: "CP",
  },
];

const HARMONY_COURSE_URL = "/comunidade";

const VOICE_SECTIONS = [
  { title: "Soprano", description: "Linhas com brilho, extensão e firmeza para conduzir melodias com segurança." },
  { title: "Contralto", description: "Camadas que preenchem o centro harmônico com textura e sustentação." },
  { title: "Tenor", description: "Ataque definido no médio/agudo para trazer energia e presença nas entradas." },
  { title: "Baixo", description: "Base sólida para ancorar acordes e fortalecer a unidade vocal." },
];

export default async function HomePage() {
  const [kits, plans] = await Promise.all([getPublishedKits(), getPlans().catch(() => [])]);

  const latestKits = kits.slice(0, 12);
  const categories = Array.from(
    new Map(
      kits
        .filter((kit) => kit.category)
        .map((kit) => [kit.category!.slug, kit.category!]),
    ).values(),
  );

  const categoryKitCount = kits.reduce<Record<string, number>>((acc, kit) => {
    if (kit.category?.slug) {
      acc[kit.category.slug] = (acc[kit.category.slug] ?? 0) + 1;
    }
    return acc;
  }, {});

  const planBySlug = new Map(plans.map((plan) => [plan.slug.toLowerCase(), plan]));

  const fallbackPlans = [
    {
      slug: "free",
      name: "Free",
      description: "Ideal para começar no Harmomus.",
      price: "Grátis",
      cta: "Começar grátis",
      offer: null,
      popular: false,
      benefits: [
        { label: "5 acessos diários a kits", included: true },
        { label: "Apenas tom original", included: true },
        { label: "Player limitado", included: true },
        { label: "Criação de playlists", included: true },
        { label: "Comunidade aberta", included: true },
        { label: "Troca de tonalidade", included: false },
        { label: "Solicitação de novos kits", included: false },
        { label: "Prioridade na confecção", included: false },
        { label: "Receber kits antecipadamente", included: false },
        { label: "Grupo exclusivo", included: false },
        { label: "Solicitação de novos tons", included: false },
      ],
    },
    {
      slug: "plus",
      name: "Plus",
      description: "Mais recursos para evolução contínua.",
      price: "R$19/mês",
      cta: "Assinar Plus",
      offer: null,
      popular: false,
      benefits: [
        { label: "Acesso ilimitado aos kits", included: true },
        { label: "Player completo", included: true },
        { label: "Apenas tom original", included: true },
        { label: "Catálogo completo", included: true },
        { label: "Criação de playlists", included: true },
        { label: "Comunidade aberta", included: true },
        { label: "Sugestões de conteúdos", included: true },
        { label: "Solicitação de novos kits", included: false },
        { label: "Prioridade na confecção", included: false },
        { label: "Receber kits antecipadamente", included: false },
        { label: "Grupo exclusivo", included: false },
        { label: "Solicitação de novos tons", included: false },
      ],
    },
    {
      slug: "premium",
      name: "Premium",
      description: "A experiência completa para ministérios.",
      price: "R$39/mês",
      cta: "Experimentar grátis por 7 dias",
      offer: "7 dias grátis",
      popular: true,
      benefits: [
        { label: "Acesso ilimitado aos kits", included: true },
        { label: "Todos os tons disponíveis", included: true },
        { label: "Troca de tonalidade", included: true },
        { label: "Catálogo completo", included: true },
        { label: "Criação de playlists", included: true },
        { label: "Solicitação de novos kits", included: true },
        { label: "Prioridade na confecção", included: true },
        { label: "Receber kits antecipadamente", included: true },
        { label: "Comunidade Harmomus + grupo Premium para pedidos", included: true },
        { label: "Solicitação de novos tons", included: true },
        { label: "Conteúdos extras", included: true },
        { label: "Votações internas", included: true },
        { label: "Selo Premium Harmomus", included: true },
      ],
    },
  ];

  return (
    <PublicAppShell>
      <main className="mx-auto w-full max-w-[1320px] space-y-10 px-4 pb-16 pt-6 md:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.35),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.28),transparent_35%),linear-gradient(145deg,#030712,#070d1f_45%,#09051a)] p-6 md:p-10">
          <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-purple-500/30 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <div className="flex flex-wrap gap-2">
                {[
                  "Streaming Vocal Premium",
                  `${kits.length}+ kits publicados`,
                  `${categories.length}+ artistas`,
                ].map((badge) => (
                  <span key={badge} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-cyan-100 backdrop-blur">
                    {badge}
                  </span>
                ))}
              </div>

              <h1 className="mt-5 text-4xl font-semibold leading-tight text-white md:text-6xl">
                O streaming vocal que transforma sua equipe em uma experiência cinematográfica.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-zinc-200 md:text-lg">
                Descubra kits com estética de álbum, mix de vozes e profundidade musical para preparar ensaios com excelência. Harmomus é a Netflix da divisão vocal com alma de worship.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/todos-os-kits" className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_40px_rgba(56,189,248,0.45)] transition hover:scale-[1.02]">
                  Explorar todos os kits
                </Link>
                <Link href="/assinar" className="rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20">
                  Teste grátis por 7 dias
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-6 -left-4 h-28 w-28 rounded-3xl border border-white/15 bg-white/10 p-3 backdrop-blur-xl">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-200">Now Playing</p>
                <p className="mt-2 text-xs text-white">Ensaio de domingo</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {latestKits.slice(0, 6).map((kit, index) => (
                  <Link
                    key={kit.id}
                    href={`/biblioteca/${kit.slug}`}
                    className={`group overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-[0_14px_35px_rgba(0,0,0,0.45)] backdrop-blur-lg transition hover:-translate-y-1 hover:border-cyan-200/70 ${index === 0 ? "col-span-2" : ""}`}
                  >
                    {kit.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={kit.coverUrl} alt={kit.name} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="aspect-square w-full bg-gradient-to-br from-zinc-700 to-zinc-950" />
                    )}
                    <div className="bg-gradient-to-t from-black/85 to-black/20 p-3">
                      <p className="truncate text-sm font-semibold text-white">{kit.name}</p>
                      <p className="truncate text-xs text-zinc-200">{kit.artist}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold text-white md:text-3xl">Últimos lançamentos</h2>
            <Link href="/todos-os-kits" className="text-sm text-cyan-200 hover:text-cyan-100">Ver todos</Link>
          </div>
          <div className="flex snap-x gap-4 overflow-x-auto pb-2">
            {latestKits.length ? latestKits.map((kit) => (
              <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="group min-w-[210px] snap-start overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 to-white/5 shadow-[0_18px_40px_rgba(8,145,178,0.18)] transition hover:scale-[1.02] hover:border-cyan-200/80 md:min-w-[260px]">
                <div className="relative">
                  <span className="absolute left-3 top-3 z-10 rounded-full bg-fuchsia-500/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">Novo</span>
                  {kit.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={kit.coverUrl} alt={kit.name} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="aspect-square w-full bg-gradient-to-br from-zinc-900 to-[#141828]" />
                  )}
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-semibold text-white">{kit.name}</p>
                  <p className="truncate text-xs text-zinc-300">{kit.artist}</p>
                </div>
              </Link>
            )) : <div className="col-span-full rounded-2xl border border-white/10 p-8 text-center text-zinc-300">Sem lançamentos publicados ainda.</div>}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Artistas & Categorias</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categories.length ? categories.map((category) => (
              <Link key={category.id} href={`/categoria/${category.slug}`} className="group relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#101827] to-[#23123e] p-6 shadow-[0_18px_48px_rgba(76,29,149,0.24)] transition hover:-translate-y-1">
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-400/20 blur-2xl" />
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Artista/Banda</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{category.name}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-200">{category.description ?? "Coleção completa de kits desta categoria para sua equipe vocal."}</p>
                <div className="mt-5 flex items-center justify-between text-sm">
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-cyan-100">{categoryKitCount[category.slug] ?? 0} kits</span>
                  <span className="text-white/90 transition group-hover:text-cyan-100">Abrir catálogo →</span>
                </div>
              </Link>
            )) : <div className="rounded-2xl border border-white/10 p-6 text-zinc-300">Nenhuma categoria com kit publicado.</div>}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Kits vocais", value: kits.length },
            { label: "Artistas/Categorias", value: categories.length },
            { label: "Planos", value: Math.max(plans.length, fallbackPlans.length) },
            { label: "Disponibilidade", value: "24/7" },
          ].map((stat) => (
            <article key={stat.label} className="rounded-2xl border border-white/15 bg-white/[0.04] p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
              <p className="text-3xl font-bold text-white">{stat.value}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-cyan-200">{stat.label}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/15 bg-gradient-to-br from-[#08142c] to-[#1b1140] p-7">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Como funciona</p>
            <h3 className="mt-3 text-3xl font-semibold text-white">Do clique ao ensaio em minutos</h3>
            <ol className="mt-4 space-y-3 text-zinc-200">
              <li>1. Escolha a música ou artista no catálogo.</li>
              <li>2. Selecione voz e tonalidade ideal.</li>
              <li>3. Monte playlists e ensaie com segurança.</li>
              <li>4. Ministre com unidade e excelência no vocal.</li>
            </ol>
            <Link href="/todos-os-kits" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900">Começar agora</Link>
          </article>
          <article className="rounded-3xl border border-white/15 bg-gradient-to-br from-[#17082f] to-[#2c0e25] p-7">
            <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-200">Vozes no Harmomus</p>
            <h3 className="mt-3 text-3xl font-semibold text-white">Estrutura vocal pensada para ministérios</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {VOICE_SECTIONS.map((voice) => (
                <div key={voice.title} className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <p className="text-sm font-semibold text-white">{voice.title}</p>
                  <p className="mt-1 text-xs text-zinc-200">{voice.description}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Depoimentos</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <article key={item.name} className="rounded-2xl border border-white/15 bg-gradient-to-br from-white/12 to-white/5 p-6 shadow-[0_15px_45px_rgba(6,182,212,0.12)] backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-400/30 text-sm font-semibold text-white">{item.avatar}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <p className="text-xs text-cyan-100">{item.role}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-zinc-200">“{item.text}”</p>
                <p className="mt-4 text-amber-300">★★★★★</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Planos</h2>
          <div className="grid gap-4 xl:grid-cols-3">
            {fallbackPlans.map((defaultPlan) => {
              const plan = planBySlug.get(defaultPlan.slug);
              const isPopular = defaultPlan.popular;

              return (
                <article key={defaultPlan.slug} className={`relative rounded-3xl border p-6 ${isPopular ? "border-fuchsia-300/70 bg-gradient-to-b from-fuchsia-500/20 via-[#181329] to-[#0b1020] shadow-[0_20px_60px_rgba(217,70,239,0.3)]" : "border-white/15 bg-white/[0.04]"}`}>
                  {isPopular ? <span className="absolute -top-3 right-6 rounded-full bg-fuchsia-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white">Mais Popular</span> : null}
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">{defaultPlan.slug}</p>
                  <h3 className="mt-2 text-3xl font-semibold text-white">{plan?.name ?? defaultPlan.name}</h3>
                  <p className="mt-1 text-zinc-200">{plan?.description ?? defaultPlan.description}</p>
                  <p className="mt-4 text-3xl font-bold text-white">{defaultPlan.price}</p>
                  <p className="text-xs text-cyan-100">{defaultPlan.offer ? `Oferta: ${defaultPlan.offer}` : "Sem fidelidade"}</p>

                  <ul className="mt-5 space-y-2">
                    {defaultPlan.benefits.map((benefit) => (
                      <li key={benefit.label} className="flex items-center gap-2 text-sm text-zinc-100">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${benefit.included ? "bg-emerald-500/25 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                          {benefit.included ? "✓" : "✕"}
                        </span>
                        {benefit.label}
                      </li>
                    ))}
                  </ul>

                  <Link href={`/assinar?plan=${defaultPlan.slug}`} className={`mt-6 inline-flex w-full justify-center rounded-xl px-4 py-3 text-sm font-semibold transition ${isPopular ? "bg-gradient-to-r from-cyan-300 to-fuchsia-300 text-slate-950 hover:opacity-90" : "border border-white/30 bg-white/10 text-white hover:bg-white/20"}`}>
                    {defaultPlan.cta}
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-300/30 bg-gradient-to-r from-cyan-900/40 via-indigo-900/35 to-fuchsia-900/30 p-7">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Curso complementar</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Foco em Harmonia</h2>
          <p className="mt-3 max-w-2xl text-zinc-100">Módulos editoriais, exercícios práticos e visão harmônica aplicada ao culto para você cantar com clareza técnica, sensibilidade e liberdade criativa.</p>
          <ul className="mt-4 grid gap-2 text-sm text-zinc-100 md:grid-cols-3">
            <li>✓ Módulos progressivos e objetivos</li>
            <li>✓ Aplicação para ensaio real</li>
            <li>✓ Certificado + comunidade</li>
          </ul>
          <Link href={HARMONY_COURSE_URL} className="mt-5 inline-flex rounded-xl bg-white px-6 py-3 text-sm font-bold text-slate-900">Conhecer o Curso</Link>
        </section>

        <footer className="rounded-3xl border border-white/10 bg-black/30 p-6">
          <div className="grid gap-6 md:grid-cols-4">
            <div>
              <p className="text-lg font-semibold text-white">Harmomus</p>
              <p className="mt-2 text-sm text-zinc-300">Plataforma vocal premium para equipes de louvor que buscam excelência musical.</p>
            </div>
            <div className="text-sm text-zinc-300">
              <p className="mb-2 font-semibold text-white">Navegação</p>
              <div className="space-y-1">
                <Link href="/todos-os-kits" className="block hover:text-white">Todos os Kits</Link>
                <Link href="/biblioteca" className="block hover:text-white">Biblioteca</Link>
                <Link href="/assinar" className="block hover:text-white">Planos</Link>
                <Link href="/login" className="block hover:text-white">Login</Link>
              </div>
            </div>
            <div className="text-sm text-zinc-300">
              <p className="mb-2 font-semibold text-white">Comunidade</p>
              <div className="space-y-1">
                <Link href="/comunidade" className="block hover:text-white">Curso Foco em Harmonia</Link>
                <Link href="/membros" className="block hover:text-white">Área de Membros</Link>
              </div>
            </div>
            <div className="text-sm text-zinc-300">
              <p className="mb-2 font-semibold text-white">Redes</p>
              <div className="space-y-1">
                <Link href="https://youtube.com" target="_blank" className="block hover:text-white">YouTube</Link>
                <Link href="https://instagram.com" target="_blank" className="block hover:text-white">Instagram</Link>
              </div>
            </div>
          </div>
          <p className="mt-6 border-t border-white/10 pt-4 text-xs text-zinc-400">© {new Date().getFullYear()} Harmomus. Todos os direitos reservados.</p>
        </footer>
      </main>
    </PublicAppShell>
  );
}
