import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe2, Heart, Star } from "lucide-react";

import { TestimonialCardDownloadButton } from "@/components/admin/testimonial-card-download-button";
import { getAdminSettings } from "@/lib/data/admin-settings";
import { getPremiumRequestById } from "@/lib/data/premium-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}

function sanitizeFeedback(value: string) {
  return value
    .replace(/Email alternativo:.*/gis, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "depoimento";
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
      frame: "from-[#050403] via-[#110b05] to-[#201204] border-amber-300/45",
      auraA: "bg-amber-300/22",
      auraB: "bg-yellow-500/20",
      accent: "text-amber-200",
      line: "border-amber-300/35",
      quote: "text-amber-200",
      pill: "border-amber-200/45 bg-amber-300/12 text-amber-100",
    };
  }

  if (style === "cyan_modern") {
    return {
      frame: "from-[#03111d] via-[#061827] to-[#08111f] border-cyan-300/45",
      auraA: "bg-cyan-300/22",
      auraB: "bg-blue-500/20",
      accent: "text-cyan-100",
      line: "border-cyan-300/35",
      quote: "text-cyan-200",
      pill: "border-cyan-200/45 bg-cyan-300/12 text-cyan-100",
    };
  }

  return {
    frame: "from-[#030712] via-[#080716] to-[#1b0821] border-fuchsia-300/35",
    auraA: "bg-cyan-300/18",
    auraB: "bg-fuchsia-500/20",
    accent: "text-cyan-100",
    line: "border-fuchsia-300/28",
    quote: "text-fuchsia-200",
    pill: "border-fuchsia-200/40 bg-fuchsia-300/12 text-fuchsia-100",
  };
}

function getTextClass(length: number, feed: boolean) {
  if (feed) {
    if (length > 760) return "text-[20px] leading-[1.15]";
    if (length > 620) return "text-[22px] leading-[1.17]";
    if (length > 460) return "text-[26px] leading-[1.18]";
    return "text-[31px] leading-[1.2]";
  }

  if (length > 1000) return "text-[29px] leading-[1.18]";
  if (length > 780) return "text-[32px] leading-[1.2]";
  if (length > 620) return "text-[35px] leading-[1.22]";
  if (length > 460) return "text-[39px] leading-[1.25]";
  return "text-[48px] leading-[1.28]";
}

export default async function TestimonialCardPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const [request, settings] = await Promise.all([getPremiumRequestById(id), getAdminSettings()]);
  if (!request) notFound();

  const format = query.format === "feed" ? "feed" : "story";
  const isFeed = format === "feed";
  const userName = request.profiles?.full_name ?? "Aluno Harmomus";
  const text = sanitizeFeedback(request.message || request.notes || "Feedback recebido pelo Harmomus.");
  const isLongText = isFeed ? text.length > 420 : text.length > 460;
  const isVeryLongText = isFeed ? text.length > 620 : text.length > 700;
  const classes = styleClasses(request.testimonial_card_style);
  const sizeClass = isFeed ? "h-[1080px] w-[1080px]" : "h-[1920px] w-[1080px]";
  const scaleClass = isFeed ? "scale-[0.62] origin-top" : "scale-[0.36] origin-top";
  const filename = `harmomus-${format}-${slugify(userName)}.png`;
  const logoUrl = settings.branding.logoUrl;
  const brandName = settings.branding.appName || "Harmomus";

  return (
    <section className="min-h-screen bg-[#030712] px-4 py-8 text-white print:bg-transparent print:p-0">
      <div className="mx-auto mb-6 flex max-w-5xl flex-col gap-3 print:hidden md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">Gerador de card</p>
          <h1 className="mt-1 text-3xl font-black">Depoimento Harmomus</h1>
          <p className="mt-1 text-sm text-zinc-400">Template sem mockups, com foco total no depoimento e na prova social.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/admin/harmomus-premium/solicitacoes/${id}`} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-zinc-100 hover:bg-white/10">Voltar</Link>
          <Link href="?format=story" className={`rounded-xl px-4 py-2 text-sm font-bold ${!isFeed ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Story 9:16</Link>
          <Link href="?format=feed" className={`rounded-xl px-4 py-2 text-sm font-bold ${isFeed ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Feed 1:1</Link>
          <TestimonialCardDownloadButton filename={filename} />
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl justify-center overflow-auto rounded-3xl border border-white/10 bg-black/30 p-4 print:block print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <article id="testimonial-card" className={`${sizeClass} ${scaleClass} relative isolate shrink-0 overflow-hidden rounded-[4rem] border bg-gradient-to-br ${classes.frame} ${isFeed ? "p-12" : "p-16"} shadow-[0_35px_120px_rgba(0,0,0,0.45)] print:scale-100 print:rounded-none print:shadow-none`}>
          <div className={`pointer-events-none absolute ${isFeed ? "-left-52 -top-52 h-[460px] w-[460px]" : "-left-40 -top-40 h-[540px] w-[540px]"} z-0 rounded-full ${classes.auraA} blur-3xl`} />
          <div className={`pointer-events-none absolute ${isFeed ? "-bottom-52 -right-52 h-[500px] w-[500px]" : "-bottom-44 -right-44 h-[620px] w-[620px]"} z-0 rounded-full ${classes.auraB} blur-3xl`} />
          <div className={`${isFeed ? "hidden" : "pointer-events-none absolute left-1/2 top-1/3 z-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl"}`} />
          <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:54px_54px] opacity-35" />
          <div className="pointer-events-none absolute inset-x-14 bottom-16 z-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          <div className="relative z-10 flex h-full min-h-0 flex-col">
            <header className={`shrink-0 flex flex-col items-center text-center ${isFeed ? "pb-3" : isVeryLongText ? "pb-6" : isLongText ? "pb-8" : "pb-12"}`}>
              {logoUrl ? (
                <img src={logoUrl} alt={brandName} className={`${isFeed ? "h-14" : isVeryLongText ? "h-18" : "h-24"} w-auto object-contain`} />
              ) : (
                <p className={`${isFeed ? "text-4xl" : "text-6xl"} font-black tracking-tight text-white`}>{brandName}</p>
              )}
              <p className={`${isFeed ? "mt-2 text-[13px]" : isVeryLongText ? "mt-3 text-base" : "mt-4 text-lg"} font-bold uppercase tracking-[0.34em] ${classes.accent}`}>Kits vocais para ministérios</p>
            </header>

            <main className={`flex min-h-0 flex-1 flex-col items-center text-center ${isFeed ? "justify-start" : "justify-center"}`}>
              <div className={`inline-flex shrink-0 items-center gap-3 rounded-full border ${classes.pill} ${isFeed ? "px-5 py-2 text-[13px]" : isVeryLongText ? "px-6 py-2 text-base" : "px-7 py-3 text-lg"} font-black uppercase tracking-[0.18em]`}>
                <Heart size={isFeed ? 15 : 22} fill="currentColor" /> Depoimento real
              </div>

              <div className={`flex shrink-0 gap-3 text-yellow-300 ${isFeed ? "mt-4" : isVeryLongText ? "mt-5 scale-85" : isLongText ? "mt-6 scale-90" : "mt-7"}`}>
                {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={isFeed ? 28 : isLongText ? 34 : 40} fill="currentColor" />)}
              </div>

              <h2 className={`${isFeed ? "mt-4 text-[56px]" : isVeryLongText ? "mt-5 text-[54px]" : isLongText ? "mt-6 text-[62px]" : "mt-8 text-[82px]"} shrink-0 font-black uppercase leading-none tracking-[0.035em] text-white`}>
                Transformando <span className="block text-violet-300">ministérios</span>
              </h2>

              <div className={`${isFeed ? "mt-6 max-w-[900px] p-7" : isVeryLongText ? "mt-7 max-w-[940px] p-8" : isLongText ? "mt-8 max-w-[930px] p-9" : "mt-12 max-w-[900px] p-12"} relative z-20 rounded-[2.4rem] border ${classes.line} bg-black/34 text-center shadow-[0_22px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl`}>
                <span className={`absolute ${isFeed ? "-left-5 -top-9 text-7xl" : isVeryLongText ? "-left-6 -top-11 text-8xl" : "-left-8 -top-14 text-9xl"} font-black ${classes.quote}`}>“</span>
                <p className={`${getTextClass(text.length, isFeed)} whitespace-pre-wrap break-words font-semibold text-white`}>{text}</p>
                <span className={`absolute ${isFeed ? "-bottom-10 right-7 text-7xl" : isVeryLongText ? "-bottom-12 right-7 text-8xl" : "-bottom-16 right-8 text-9xl"} font-black ${classes.quote}`}>”</span>
              </div>

              <div className={`${isFeed ? "mt-7" : isVeryLongText ? "mt-8" : isLongText ? "mt-9" : "mt-14"} flex shrink-0 items-center justify-center gap-5`}>
                {request.profiles?.avatar_url ? (
                  <img src={request.profiles.avatar_url} alt="" className={`${isFeed ? "h-18 w-18" : isLongText ? "h-20 w-20" : "h-24 w-24"} rounded-full border border-white/25 object-cover shadow-[0_0_45px_rgba(168,85,247,0.35)]`} />
                ) : (
                  <div className={`${isFeed ? "h-18 w-18" : isLongText ? "h-20 w-20" : "h-24 w-24"} grid place-items-center rounded-full border border-white/20 bg-white/10 text-2xl font-black text-white shadow-[0_0_45px_rgba(168,85,247,0.35)]`}>{initials(userName)}</div>
                )}
                <div className="text-left">
                  <p className={`${isFeed ? "text-2xl" : isLongText ? "text-3xl" : "text-4xl"} font-black uppercase tracking-[0.08em] text-white`}>{userName}</p>
                  <p className={`mt-1 ${isFeed || isLongText ? "text-sm" : "text-base"} font-bold uppercase tracking-[0.18em] ${classes.accent}`}>Assinante Harmomus Premium</p>
                </div>
              </div>
            </main>

            <footer className={`${isFeed ? "gap-2 pt-5" : isVeryLongText ? "gap-3 pt-7" : isLongText ? "gap-4 pt-8" : "gap-5 pt-12"} shrink-0 flex flex-col items-center justify-center border-t border-white/10 text-center`}>
              <div className={`inline-flex items-center gap-3 rounded-full border ${classes.line} bg-black/25 ${isFeed ? "px-6 py-2" : isLongText ? "px-8 py-3" : "px-10 py-4"}`}>
                <Globe2 size={isFeed ? 24 : isLongText ? 28 : 32} className={classes.accent} />
                <span className={`${isFeed ? "text-2xl" : isLongText ? "text-3xl" : "text-4xl"} font-black tracking-tight text-white`}>harmomus.com</span>
              </div>
              <p className={`${isFeed ? "text-base" : isLongText ? "text-lg" : "text-xl"} font-semibold text-white/70`}>Sua voz. <span className={classes.accent}>Sua missão.</span> Seu propósito.</p>
            </footer>
          </div>
        </article>
      </div>

      <div className="mx-auto mt-5 max-w-5xl rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-zinc-300 print:hidden">Correção aplicada: mockups removidos e layout reorganizado para priorizar leitura, prova social e marca.</div>
    </section>
  );
}
