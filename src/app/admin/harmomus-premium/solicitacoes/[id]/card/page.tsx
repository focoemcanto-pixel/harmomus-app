import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, Download, Star } from "lucide-react";

import { getPremiumRequestById } from "@/lib/data/premium-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}

function clampText(value: string, max = 520) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "HM";
}

function styleClasses(style?: string | null) {
  if (style === "gold_ministry") {
    return {
      frame: "from-[#090806] via-[#171008] to-[#2b1b07] border-amber-300/45",
      glowA: "bg-amber-300/25",
      glowB: "bg-yellow-600/20",
      accent: "text-amber-200",
      badge: "border-amber-200/45 bg-amber-300/15 text-amber-100",
      button: "from-amber-200 to-yellow-500 text-black",
    };
  }

  if (style === "cyan_modern") {
    return {
      frame: "from-[#03131f] via-[#061b2b] to-[#08111f] border-cyan-300/45",
      glowA: "bg-cyan-300/25",
      glowB: "bg-blue-600/20",
      accent: "text-cyan-100",
      badge: "border-cyan-200/45 bg-cyan-300/15 text-cyan-100",
      button: "from-cyan-200 to-blue-400 text-slate-950",
    };
  }

  return {
    frame: "from-[#060914] via-[#12091f] to-[#20081d] border-fuchsia-300/35",
    glowA: "bg-cyan-300/20",
    glowB: "bg-fuchsia-500/20",
    accent: "text-cyan-100",
    badge: "border-fuchsia-200/40 bg-fuchsia-300/12 text-fuchsia-100",
    button: "from-cyan-300 to-fuchsia-300 text-slate-950",
  };
}

export default async function TestimonialCardPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const request = await getPremiumRequestById(id);
  if (!request) notFound();

  const format = query.format === "feed" ? "feed" : "story";
  const isFeed = format === "feed";
  const userName = request.profiles?.full_name ?? "Aluno Harmomus";
  const title = request.testimonial_card_title || "O que nossos alunos dizem";
  const text = clampText(request.message || request.notes || "Feedback recebido pelo Harmomus.", isFeed ? 390 : 520);
  const classes = styleClasses(request.testimonial_card_style);
  const widthClass = isFeed ? "w-[720px] h-[720px]" : "w-[540px] h-[960px]";

  return (
    <section className="min-h-screen bg-[#030712] px-4 py-8 text-white print:bg-transparent print:p-0">
      <div className="mx-auto mb-6 flex max-w-5xl flex-col gap-3 print:hidden md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">Gerador de card</p>
          <h1 className="mt-1 text-3xl font-black">Depoimento Harmomus</h1>
          <p className="mt-1 text-sm text-zinc-400">Abra em tela cheia e use o botão de baixar/salvar imagem do navegador ou capture o card.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/harmomus-premium/solicitacoes/${id}`} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-zinc-100 hover:bg-white/10">Voltar</Link>
          <Link href={`?format=story`} className={`rounded-xl px-4 py-2 text-sm font-bold ${!isFeed ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Story 9:16</Link>
          <Link href={`?format=feed`} className={`rounded-xl px-4 py-2 text-sm font-bold ${isFeed ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Feed 1:1</Link>
          <button onClick={undefined as never} className={`hidden rounded-xl bg-gradient-to-r ${classes.button} px-4 py-2 text-sm font-black`}>
            <Download size={15} /> Baixar PNG
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl justify-center overflow-auto rounded-3xl border border-white/10 bg-black/30 p-4 print:block print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <article id="testimonial-card" className={`${widthClass} relative shrink-0 overflow-hidden rounded-[2rem] border bg-gradient-to-br ${classes.frame} p-10 shadow-[0_35px_120px_rgba(0,0,0,0.45)] print:rounded-none print:shadow-none`}>
          <div className={`absolute -left-24 -top-24 h-72 w-72 rounded-full ${classes.glowA} blur-3xl`} />
          <div className={`absolute -bottom-24 -right-24 h-80 w-80 rounded-full ${classes.glowB} blur-3xl`} />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:42px_42px] opacity-40" />

          <div className="relative flex h-full flex-col">
            <header className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-black uppercase tracking-[0.28em] text-white/55">Harmomus</p>
                <p className={`mt-1 text-sm font-bold ${classes.accent}`}>Kits vocais para ministérios</p>
              </div>
              <div className={`grid h-16 w-16 place-items-center rounded-2xl border ${classes.badge} text-2xl font-black`}>H</div>
            </header>

            <main className="flex flex-1 flex-col justify-center py-8">
              <span className={`mb-6 inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-black uppercase tracking-[0.18em] ${classes.badge}`}>
                <Star size={15} /> Depoimento real
              </span>

              <h2 className={`${isFeed ? "text-5xl" : "text-6xl"} max-w-[92%] font-black leading-[0.98] tracking-tight text-white`}>
                {title}
              </h2>

              <div className={`${isFeed ? "mt-8" : "mt-10"} rounded-[1.6rem] border border-white/12 bg-black/28 p-7 backdrop-blur-xl`}>
                <p className={`${isFeed ? "text-2xl leading-9" : "text-[27px] leading-10"} font-semibold text-white`}>
                  “{text}”
                </p>
              </div>
            </main>

            <footer className="relative flex items-center justify-between gap-5 border-t border-white/10 pt-6">
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 bg-white/10 text-lg font-black text-white">
                  {request.profiles?.avatar_url ? <img src={request.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(userName)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xl font-black text-white">{userName}</p>
                  <p className={`truncate text-sm font-bold ${classes.accent}`}>Assinante Harmomus Premium</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-white/60">
                <Camera size={20} />
                <span className="text-sm font-bold">harmomus.com</span>
              </div>
            </footer>
          </div>
        </article>
      </div>

      <div className="mx-auto mt-5 max-w-5xl rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-zinc-300 print:hidden">
        Para baixar agora: use o print/captura do navegador na área do card. Na próxima etapa dá para adicionar download PNG automático com renderização client-side.
      </div>
    </section>
  );
}
