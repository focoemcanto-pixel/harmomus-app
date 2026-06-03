import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe2, Star } from "lucide-react";

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

function clampText(value: string, max = 330) {
  const normalized = sanitizeFeedback(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
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

function styleClasses(style?: string | null) {
  if (style === "gold_ministry") {
    return {
      frame: "from-[#050403] via-[#110b05] to-[#201204] border-amber-300/45",
      auraA: "bg-amber-300/20",
      auraB: "bg-yellow-500/18",
      accent: "text-amber-200",
      line: "border-amber-300/35",
      badge: "border-amber-200/45 bg-amber-300/12 text-amber-100",
      quote: "text-amber-200",
    };
  }

  if (style === "cyan_modern") {
    return {
      frame: "from-[#03111d] via-[#061827] to-[#08111f] border-cyan-300/45",
      auraA: "bg-cyan-300/20",
      auraB: "bg-blue-500/18",
      accent: "text-cyan-100",
      line: "border-cyan-300/35",
      badge: "border-cyan-200/45 bg-cyan-300/12 text-cyan-100",
      quote: "text-cyan-200",
    };
  }

  return {
    frame: "from-[#030712] via-[#080716] to-[#1b0821] border-fuchsia-300/35",
    auraA: "bg-cyan-300/18",
    auraB: "bg-fuchsia-500/18",
    accent: "text-cyan-100",
    line: "border-fuchsia-300/28",
    badge: "border-fuchsia-200/40 bg-fuchsia-300/12 text-fuchsia-100",
    quote: "text-fuchsia-200",
  };
}

function LaptopMockup({ feed = false }: { feed?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[1.2rem] border border-white/20 bg-[#050812] shadow-[0_34px_80px_rgba(0,0,0,0.62)] ${feed ? "h-[155px] w-[355px]" : "h-[300px] w-[650px]"}`}>
      <div className={`${feed ? "h-5 px-3" : "h-7 px-4"} flex items-center gap-1.5 border-b border-white/10 bg-white/[0.06]`}>
        <span className={`${feed ? "h-1.5 w-1.5" : "h-2 w-2"} rounded-full bg-red-300/70`} />
        <span className={`${feed ? "h-1.5 w-1.5" : "h-2 w-2"} rounded-full bg-amber-300/70`} />
        <span className={`${feed ? "h-1.5 w-1.5" : "h-2 w-2"} rounded-full bg-emerald-300/70`} />
        <span className={`${feed ? "ml-2 h-2 w-20" : "ml-4 h-2.5 w-36"} rounded-full bg-white/12`} />
      </div>
      <img src="/testimonials/harmomus-home-mobile.svg" alt="Harmomus aberto no desktop" className="h-full w-full object-cover object-top opacity-95" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
      <div className={`${feed ? "-bottom-4 h-4 w-28" : "-bottom-6 h-6 w-40"} absolute left-1/2 -translate-x-1/2 rounded-b-2xl bg-black/80`} />
    </div>
  );
}

function PhoneMockup({ variant = "home", feed = false }: { variant?: "home" | "player"; feed?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[1.7rem] border border-white/25 bg-[#050812] p-2 shadow-[0_28px_70px_rgba(0,0,0,0.65)] ${feed ? "h-[185px] w-[88px]" : "h-[390px] w-[186px]"}`}>
      <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-white/25" />
      <div className="h-full overflow-hidden rounded-[1.25rem] bg-black">
        <img src="/testimonials/harmomus-home-mobile.svg" alt={variant === "player" ? "Player Harmomus no celular" : "Home Harmomus no celular"} className={`h-full w-full object-cover ${variant === "player" ? "object-center" : "object-top"}`} />
      </div>
    </div>
  );
}

function MockupShowcase({ feed }: { feed: boolean }) {
  return (
    <section className={`relative mx-auto ${feed ? "mt-5 h-[180px] w-[720px]" : "mt-14 h-[430px] w-[900px]"}`}>
      <div className="absolute left-1/2 top-0 -translate-x-1/2">
        <LaptopMockup feed={feed} />
      </div>
      <div className={`absolute ${feed ? "left-[13%] top-8" : "left-[2%] top-20"} -rotate-[4deg]`}>
        <PhoneMockup variant="player" feed={feed} />
      </div>
      <div className={`absolute ${feed ? "right-[13%] top-8" : "right-[1%] top-20"} rotate-[4deg]`}>
        <PhoneMockup variant="home" feed={feed} />
      </div>
    </section>
  );
}

export default async function TestimonialCardPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const [request, settings] = await Promise.all([getPremiumRequestById(id), getAdminSettings()]);
  if (!request) notFound();

  const format = query.format === "feed" ? "feed" : "story";
  const isFeed = format === "feed";
  const userName = request.profiles?.full_name ?? "Aluno Harmomus";
  const text = clampText(request.message || request.notes || "Feedback recebido pelo Harmomus.", isFeed ? 245 : 360);
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
          <p className="mt-1 text-sm text-zinc-400">Mockups reduzidos no Feed para não sobrepor o título.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/admin/harmomus-premium/solicitacoes/${id}`} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-zinc-100 hover:bg-white/10">Voltar</Link>
          <Link href="?format=story" className={`rounded-xl px-4 py-2 text-sm font-bold ${!isFeed ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Story 9:16</Link>
          <Link href="?format=feed" className={`rounded-xl px-4 py-2 text-sm font-bold ${isFeed ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Feed 1:1</Link>
          <TestimonialCardDownloadButton filename={filename} />
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl justify-center overflow-auto rounded-3xl border border-white/10 bg-black/30 p-4 print:block print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <article id="testimonial-card" className={`${sizeClass} ${scaleClass} relative shrink-0 overflow-hidden rounded-[4rem] border bg-gradient-to-br ${classes.frame} ${isFeed ? "p-12" : "p-16"} shadow-[0_35px_120px_rgba(0,0,0,0.45)] print:scale-100 print:rounded-none print:shadow-none`}>
          <div className={`absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full ${classes.auraA} blur-3xl`} />
          <div className={`absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full ${classes.auraB} blur-3xl`} />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:54px_54px] opacity-40" />
          <div className="absolute inset-x-16 bottom-16 h-48 rounded-full bg-fuchsia-500/12 blur-3xl" />

          <div className="relative flex h-full flex-col">
            <header className="flex flex-col items-center text-center">
              {logoUrl ? <img src={logoUrl} alt={brandName} className={isFeed ? "h-20 w-auto object-contain" : "h-28 w-auto object-contain"} /> : <p className="text-6xl font-black tracking-tight text-white">{brandName}</p>}
              <p className={`${isFeed ? "mt-3 text-base" : "mt-5 text-xl"} font-bold uppercase tracking-[0.34em] ${classes.accent}`}>Kits vocais para ministérios</p>
            </header>

            <MockupShowcase feed={isFeed} />

            <main className={`flex flex-1 flex-col items-center text-center ${isFeed ? "pt-0" : "pt-10"}`}>
              <div className="flex gap-3 text-yellow-300">
                {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={isFeed ? 30 : 42} fill="currentColor" />)}
              </div>

              <h2 className={`${isFeed ? "mt-4 text-[54px]" : "mt-8 text-7xl"} font-black uppercase leading-none tracking-[0.055em] text-white`}>Transformando <span className="text-violet-300">ministérios</span></h2>

              <div className={`${isFeed ? "mt-5 max-w-[880px] p-6" : "mt-10 max-w-[840px] p-11"} relative rounded-[2.4rem] border ${classes.line} bg-black/32 backdrop-blur-xl`}>
                <span className={`absolute ${isFeed ? "-left-4 -top-8 text-7xl" : "-left-7 -top-10 text-8xl"} font-black ${classes.quote}`}>“</span>
                <p className={`${isFeed ? "text-[27px] leading-[1.3]" : "text-[39px] leading-[1.42]"} font-semibold text-white`}>{text}</p>
                <span className={`absolute ${isFeed ? "-bottom-10 right-5 text-7xl" : "-bottom-16 right-7 text-8xl"} font-black ${classes.quote}`}>”</span>
              </div>

              <div className={`${isFeed ? "mt-6" : "mt-12"} flex items-center justify-center gap-4`}>
                {request.profiles?.avatar_url ? <img src={request.profiles.avatar_url} alt="" className="h-20 w-20 rounded-full border border-white/25 object-cover" /> : null}
                <div className={request.profiles?.avatar_url ? "text-left" : "text-center"}>
                  <p className="text-3xl font-black uppercase tracking-[0.08em] text-white">{userName}</p>
                  <p className={`mt-1 text-base font-bold uppercase tracking-[0.18em] ${classes.accent}`}>Assinante Harmomus Premium</p>
                </div>
              </div>
            </main>

            <footer className={`${isFeed ? "gap-3 pt-4" : "gap-5 pt-10"} flex flex-col items-center justify-center border-t border-white/10 text-center`}>
              <div className={`inline-flex items-center gap-4 rounded-full border ${classes.line} bg-black/25 ${isFeed ? "px-8 py-3" : "px-10 py-4"}`}><Globe2 size={isFeed ? 28 : 32} className={classes.accent} /><span className={`${isFeed ? "text-3xl" : "text-4xl"} font-black tracking-tight text-white`}>harmomus.com</span></div>
              <p className={`${isFeed ? "text-lg" : "text-xl"} font-semibold text-white/70`}>Sua voz. <span className={classes.accent}>Sua missão.</span> Seu propósito.</p>
            </footer>
          </div>
        </article>
      </div>

      <div className="mx-auto mt-5 max-w-5xl rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-zinc-300 print:hidden">Correção aplicada: no Feed 1:1, os mockups foram reduzidos e a área visual ficou limitada para não invadir o título.</div>
    </section>
  );
}
