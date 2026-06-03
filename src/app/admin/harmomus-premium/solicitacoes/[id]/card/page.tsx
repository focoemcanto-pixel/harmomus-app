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

function clampText(value: string, max = 360) {
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

function DesktopMockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[1.2rem] border border-white/18 bg-[#050812] shadow-[0_28px_70px_rgba(0,0,0,0.55)] ${compact ? "h-[145px] w-[280px]" : "h-[235px] w-[455px]"}`}>
      <div className="flex h-6 items-center gap-1.5 border-b border-white/10 bg-white/[0.06] px-4">
        <span className="h-2 w-2 rounded-full bg-red-300/70" />
        <span className="h-2 w-2 rounded-full bg-amber-300/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-300/70" />
        <span className="ml-4 h-2.5 w-32 rounded-full bg-white/12" />
      </div>
      <div className="absolute inset-x-5 top-12 rounded-[1.1rem] border border-white/12 bg-[radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.35),transparent_35%),linear-gradient(135deg,#08162b,#160e35)] p-5">
        <div className="h-2.5 w-24 rounded-full bg-white/55" />
        <div className="mt-4 h-5 w-44 rounded-full bg-white/90" />
        <div className="mt-2 h-2.5 w-56 rounded-full bg-white/35" />
        <div className="mt-4 h-7 w-24 rounded-full bg-cyan-300" />
      </div>
      <div className="absolute bottom-6 left-7 right-7 grid grid-cols-3 gap-2.5">
        <div className="h-10 rounded-xl bg-white/8" />
        <div className="h-10 rounded-xl bg-white/8" />
        <div className="h-10 rounded-xl bg-white/8" />
      </div>
      <div className="absolute -bottom-6 left-1/2 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-black/70" />
    </div>
  );
}

function PhoneMockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[1.5rem] border border-white/18 bg-[#050812] p-2 shadow-[0_22px_55px_rgba(0,0,0,0.6)] ${compact ? "h-[178px] w-[86px]" : "h-[285px] w-[138px]"}`}>
      <div className="mx-auto mb-2 h-1.5 w-8 rounded-full bg-white/25" />
      <div className="h-full rounded-[1rem] bg-[radial-gradient(circle_at_75%_15%,rgba(139,92,246,0.42),transparent_28%),linear-gradient(180deg,#101827,#050812)] p-3">
        <div className="h-2 w-10 rounded-full bg-white/55" />
        <div className="mt-5 h-3 w-12 rounded-full bg-white/90" />
        <div className="mt-2 h-2 w-14 rounded-full bg-white/35" />
        <div className="mt-5 h-16 rounded-xl border border-white/12 bg-white/8" />
        <div className="mt-3 h-5 w-12 rounded-full bg-cyan-300" />
      </div>
    </div>
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
  const testimonialTitle = request.testimonial_card_title || "Depoimento real";
  const text = clampText(request.message || request.notes || "Feedback recebido pelo Harmomus.", isFeed ? 280 : 360);
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
          <p className="mt-1 text-sm text-zinc-400">Template premium com logo real, mockups do app e site em destaque.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/admin/harmomus-premium/solicitacoes/${id}`} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-zinc-100 hover:bg-white/10">Voltar</Link>
          <Link href={`?format=story`} className={`rounded-xl px-4 py-2 text-sm font-bold ${!isFeed ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Story 9:16</Link>
          <Link href={`?format=feed`} className={`rounded-xl px-4 py-2 text-sm font-bold ${isFeed ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Feed 1:1</Link>
          <TestimonialCardDownloadButton filename={filename} />
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl justify-center overflow-auto rounded-3xl border border-white/10 bg-black/30 p-4 print:block print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <article id="testimonial-card" className={`${sizeClass} ${scaleClass} relative shrink-0 overflow-hidden rounded-[4rem] border bg-gradient-to-br ${classes.frame} p-16 shadow-[0_35px_120px_rgba(0,0,0,0.45)] print:scale-100 print:rounded-none print:shadow-none`}>
          <div className={`absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full ${classes.auraA} blur-3xl`} />
          <div className={`absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full ${classes.auraB} blur-3xl`} />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:54px_54px] opacity-40" />
          <div className="absolute inset-x-16 bottom-16 h-48 rounded-full bg-fuchsia-500/12 blur-3xl" />

          <div className="relative flex h-full flex-col">
            <header className="flex flex-col items-center text-center">
              {logoUrl ? <img src={logoUrl} alt={brandName} className={isFeed ? "h-24 w-auto object-contain" : "h-28 w-auto object-contain"} /> : <p className="text-6xl font-black tracking-tight text-white">{brandName}</p>}
              <p className={`mt-5 text-xl font-bold uppercase tracking-[0.34em] ${classes.accent}`}>Kits vocais para ministérios</p>
            </header>

            <section className={`relative mx-auto ${isFeed ? "mt-10 h-[250px] w-[760px]" : "mt-14 h-[350px] w-[840px]"}`}>
              <div className="absolute left-1/2 top-0 -translate-x-1/2"><DesktopMockup compact={isFeed} /></div>
              <div className="absolute bottom-0 right-[12%] rotate-[5deg]"><PhoneMockup compact={isFeed} /></div>
              <div className="absolute bottom-2 left-[13%] -rotate-[5deg]"><PhoneMockup compact={isFeed} /></div>
            </section>

            <main className={`flex flex-1 flex-col items-center text-center ${isFeed ? "pt-10" : "pt-16"}`}>
              <div className={`inline-flex items-center gap-3 rounded-full border px-7 py-3 text-lg font-black uppercase tracking-[0.22em] ${classes.badge}`}><Star size={24} /> {testimonialTitle}</div>

              <h2 className={`${isFeed ? "mt-9 text-6xl" : "mt-12 text-7xl"} font-black leading-none tracking-tight text-white`}>Transformando<br />ministérios</h2>

              <div className={`${isFeed ? "mt-9 max-w-[820px] p-9" : "mt-14 max-w-[840px] p-11"} relative rounded-[2.4rem] border ${classes.line} bg-black/32 backdrop-blur-xl`}>
                <span className={`absolute -left-7 -top-10 text-8xl font-black ${classes.quote}`}>“</span>
                <p className={`${isFeed ? "text-[33px] leading-[1.35]" : "text-[39px] leading-[1.42]"} font-semibold text-white`}>{text}</p>
                <span className={`absolute -bottom-16 right-7 text-8xl font-black ${classes.quote}`}>”</span>
              </div>

              <div className={`${isFeed ? "mt-11" : "mt-16"} flex items-center justify-center gap-4`}>
                {request.profiles?.avatar_url ? <img src={request.profiles.avatar_url} alt="" className="h-20 w-20 rounded-full border border-white/25 object-cover" /> : null}
                <div className={request.profiles?.avatar_url ? "text-left" : "text-center"}>
                  <p className="text-3xl font-black text-white">{userName}</p>
                  <p className={`mt-1 text-base font-bold uppercase tracking-[0.18em] ${classes.accent}`}>Assinante Harmomus Premium</p>
                </div>
              </div>
            </main>

            <footer className="flex flex-col items-center justify-center gap-5 border-t border-white/10 pt-10 text-center">
              <div className={`inline-flex items-center gap-4 rounded-full border ${classes.line} bg-black/25 px-10 py-4`}><Globe2 size={32} className={classes.accent} /><span className="text-4xl font-black tracking-tight text-white">harmomus.com</span></div>
              {!isFeed ? <p className="text-xl font-semibold text-white/70">Sua voz. Sua missão. Seu propósito.</p> : null}
            </footer>
          </div>
        </article>
      </div>

      <div className="mx-auto mt-5 max-w-5xl rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-zinc-300 print:hidden">O texto do depoimento agora é limitado e limpo automaticamente para evitar cortes e remover e-mails/links.</div>
    </section>
  );
}
