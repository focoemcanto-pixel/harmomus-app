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
      quote: "text-cyan-200",
    };
  }

  return {
    frame: "from-[#030712] via-[#080716] to-[#1b0821] border-fuchsia-300/35",
    auraA: "bg-cyan-300/18",
    auraB: "bg-fuchsia-500/18",
    accent: "text-cyan-100",
    line: "border-fuchsia-300/28",
    quote: "text-fuchsia-200",
  };
}

function getTextClass(length: number, feed: boolean) {
  if (feed) {
    if (length > 650) return "text-[20px] leading-[1.2]";
    if (length > 520) return "text-[22px] leading-[1.22]";
    if (length > 390) return "text-[24px] leading-[1.25]";
    return "text-[27px] leading-[1.3]";
  }

  if (length > 900) return "text-[25px] leading-[1.23]";
  if (length > 700) return "text-[28px] leading-[1.27]";
  if (length > 520) return "text-[31px] leading-[1.32]";
  return "text-[36px] leading-[1.38]";
}

function LaptopMockup({ feed = false, density = "normal" }: { feed?: boolean; density?: "normal" | "compact" | "mini" }) {
  const size = feed
    ? density === "mini" ? "h-[92px] w-[225px]" : density === "compact" ? "h-[112px] w-[270px]" : "h-[135px] w-[315px]"
    : density === "mini" ? "h-[120px] w-[280px]" : density === "compact" ? "h-[150px] w-[350px]" : "h-[190px] w-[440px]";

  return (
    <div className={`relative overflow-hidden rounded-[1.2rem] border border-white/20 bg-[#050812] shadow-[0_34px_80px_rgba(0,0,0,0.62)] ${size}`}>
      <div className={`${feed || density !== "normal" ? "h-5 px-3" : "h-6 px-4"} flex items-center gap-1.5 border-b border-white/10 bg-white/[0.06]`}>
        <span className="h-1.5 w-1.5 rounded-full bg-red-300/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
        <span className="ml-2 h-2 w-20 rounded-full bg-white/12" />
      </div>
      <img src="/testimonials/harmomus-home-mobile.svg" alt="Harmomus aberto no desktop" className="h-full w-full object-cover object-top opacity-95" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
    </div>
  );
}

function PhoneMockup({ variant = "home", feed = false, density = "normal" }: { variant?: "home" | "player"; feed?: boolean; density?: "normal" | "compact" | "mini" }) {
  const size = feed
    ? density === "mini" ? "h-[110px] w-[54px]" : density === "compact" ? "h-[132px] w-[64px]" : "h-[165px] w-[80px]"
    : density === "mini" ? "h-[150px] w-[72px]" : density === "compact" ? "h-[190px] w-[90px]" : "h-[235px] w-[112px]";

  return (
    <div className={`relative overflow-hidden rounded-[1.4rem] border border-white/25 bg-[#050812] p-1.5 shadow-[0_28px_70px_rgba(0,0,0,0.65)] ${size}`}>
      <div className="mx-auto mb-1.5 h-1.5 w-7 rounded-full bg-white/25" />
      <div className="h-full overflow-hidden rounded-[0.95rem] bg-black">
        <img src="/testimonials/harmomus-home-mobile.svg" alt={variant === "player" ? "Player Harmomus no celular" : "Home Harmomus no celular"} className={`h-full w-full object-cover ${variant === "player" ? "object-center" : "object-top"}`} />
      </div>
    </div>
  );
}

function MockupShowcase({ feed, density }: { feed: boolean; density: "normal" | "compact" | "mini" }) {
  const frame = feed
    ? density === "mini" ? "mt-4 h-[108px] w-[520px]" : density === "compact" ? "mt-4 h-[125px] w-[590px]" : "mt-5 h-[160px] w-[660px]"
    : density === "mini" ? "mt-6 h-[165px] w-[560px]" : density === "compact" ? "mt-8 h-[215px] w-[640px]" : "mt-10 h-[260px] w-[760px]";

  return (
    <section className={`relative mx-auto ${frame}`}>
      <div className="absolute left-1/2 top-0 -translate-x-1/2">
        <LaptopMockup feed={feed} density={density} />
      </div>
      <div className={`absolute ${feed ? "left-[16%] top-5" : density === "mini" ? "left-[14%] top-5" : density === "compact" ? "left-[10%] top-8" : "left-[7%] top-10"} -rotate-[4deg]`}>
        <PhoneMockup variant="player" feed={feed} density={density} />
      </div>
      <div className={`absolute ${feed ? "right-[16%] top-5" : density === "mini" ? "right-[14%] top-5" : density === "compact" ? "right-[10%] top-8" : "right-[7%] top-10"} rotate-[4deg]`}>
        <PhoneMockup variant="home" feed={feed} density={density} />
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
  const text = sanitizeFeedback(request.message || request.notes || "Feedback recebido pelo Harmomus.");
  const isLongText = isFeed ? text.length > 380 : text.length > 520;
  const isVeryLongText = isFeed ? text.length > 560 : text.length > 700;
  const mockupDensity: "normal" | "compact" | "mini" = isVeryLongText ? "mini" : isLongText ? "compact" : "normal";
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
          <p className="mt-1 text-sm text-zinc-400">Mockup proporcional ao depoimento: discreto no topo, sem roubar a cena.</p>
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
              {logoUrl ? <img src={logoUrl} alt={brandName} className={isFeed ? "h-20 w-auto object-contain" : isVeryLongText ? "h-20 w-auto object-contain" : "h-24 w-auto object-contain"} /> : <p className="text-6xl font-black tracking-tight text-white">{brandName}</p>}
              <p className={`${isFeed ? "mt-3 text-base" : isVeryLongText ? "mt-3 text-base" : "mt-4 text-lg"} font-bold uppercase tracking-[0.34em] ${classes.accent}`}>Kits vocais para ministérios</p>
            </header>

            <MockupShowcase feed={isFeed} density={mockupDensity} />

            <main className={`flex flex-1 flex-col items-center text-center ${isFeed ? "pt-0" : isLongText ? "pt-4" : "pt-6"}`}>
              <div className="flex gap-3 text-yellow-300">
                {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={isFeed ? 28 : isLongText ? 32 : 36} fill="currentColor" />)}
              </div>

              <h2 className={`${isFeed ? "mt-3 text-[46px]" : isLongText ? "mt-4 text-[52px]" : "mt-5 text-[58px]"} font-black uppercase leading-none tracking-[0.055em] text-white`}>Transformando <span className="text-violet-300">ministérios</span></h2>

              <div className={`${isFeed ? "mt-4 max-w-[900px] p-5" : isLongText ? "mt-6 max-w-[920px] p-8" : "mt-8 max-w-[900px] p-10"} relative rounded-[2.4rem] border ${classes.line} bg-black/32 backdrop-blur-xl`}>
                <span className={`absolute ${isFeed ? "-left-4 -top-7 text-6xl" : "-left-6 -top-9 text-7xl"} font-black ${classes.quote}`}>“</span>
                <p className={`${getTextClass(text.length, isFeed)} font-semibold text-white`}>{text}</p>
                <span className={`absolute ${isFeed ? "-bottom-9 right-5 text-6xl" : "-bottom-12 right-7 text-7xl"} font-black ${classes.quote}`}>”</span>
              </div>

              <div className={`${isFeed ? "mt-5" : isLongText ? "mt-7" : "mt-10"} flex items-center justify-center gap-4`}>
                {request.profiles?.avatar_url ? <img src={request.profiles.avatar_url} alt="" className={`${isFeed || isLongText ? "h-16 w-16" : "h-20 w-20"} rounded-full border border-white/25 object-cover`} /> : null}
                <div className={request.profiles?.avatar_url ? "text-left" : "text-center"}>
                  <p className={`${isFeed || isLongText ? "text-2xl" : "text-3xl"} font-black uppercase tracking-[0.08em] text-white`}>{userName}</p>
                  <p className={`mt-1 ${isFeed || isLongText ? "text-sm" : "text-base"} font-bold uppercase tracking-[0.18em] ${classes.accent}`}>Assinante Harmomus Premium</p>
                </div>
              </div>
            </main>

            <footer className={`${isFeed ? "gap-2 pt-3" : isLongText ? "gap-3 pt-5" : "gap-4 pt-8"} flex flex-col items-center justify-center border-t border-white/10 text-center`}>
              <div className={`inline-flex items-center gap-4 rounded-full border ${classes.line} bg-black/25 ${isFeed || isLongText ? "px-7 py-2.5" : "px-10 py-4"}`}><Globe2 size={isFeed || isLongText ? 24 : 30} className={classes.accent} /><span className={`${isFeed || isLongText ? "text-2xl" : "text-3xl"} font-black tracking-tight text-white`}>harmomus.com</span></div>
              <p className={`${isFeed || isLongText ? "text-base" : "text-lg"} font-semibold text-white/70`}>Sua voz. <span className={classes.accent}>Sua missão.</span> Seu propósito.</p>
            </footer>
          </div>
        </article>
      </div>

      <div className="mx-auto mt-5 max-w-5xl rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-zinc-300 print:hidden">Correção aplicada: o mockup permanece no topo, mas agora é proporcional ao tamanho do depoimento e não ocupa a maior parte do card.</div>
    </section>
  );
}
