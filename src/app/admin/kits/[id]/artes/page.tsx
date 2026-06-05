import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, LockKeyhole, Music2, PlayCircle, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";

import { TestimonialCardDownloadButton } from "@/components/admin/testimonial-card-download-button";
import { getAdminSettings } from "@/lib/data/admin-settings";
import { getKitById } from "@/lib/data/kits";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "kit-vocal";
}

function getPlanLabel(plan?: string | null) {
  if (!plan) return "PREMIUM";
  if (plan.toLowerCase().includes("plus")) return "PLUS";
  if (plan.toLowerCase().includes("premium")) return "PREMIUM";
  return plan.toUpperCase();
}

function HarmomusBrand({ logoUrl }: { logoUrl?: string | null }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="Harmomus" className="h-20 w-auto object-contain" />;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/8 ring-1 ring-white/15">
        <Music2 className="text-violet-300" size={34} />
      </div>
      <p className="text-5xl font-black tracking-tight text-white">Harmo<span className="text-violet-300">mus</span></p>
    </div>
  );
}

function PhoneMockup({ coverUrl, kitName, artist, plan }: { coverUrl: string; kitName: string; artist: string; plan: string }) {
  return (
    <div className="relative h-[560px] w-[280px] rotate-[7deg] rounded-[3.2rem] border-[10px] border-[#111827] bg-[#05070d] p-3 shadow-[0_35px_90px_rgba(0,0,0,.65)] ring-2 ring-white/15">
      <div className="absolute left-1/2 top-2 z-30 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />
      <div className="h-full overflow-hidden rounded-[2.25rem] bg-[#070914]">
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-xl font-black text-white">Harmomus</p>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-200 to-violet-400" />
        </div>
        <div className="mx-4 overflow-hidden rounded-3xl border border-white/10 bg-black/40">
          <img src={coverUrl} alt="" className="h-56 w-full object-cover" />
        </div>
        <div className="px-5 py-4">
          <span className="rounded-full bg-violet-500 px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-white">{plan}</span>
          <h3 className="mt-4 line-clamp-2 text-2xl font-black leading-none text-white">{kitName}</h3>
          <p className="mt-1 text-sm text-white/60">{artist}</p>
          <div className="mt-5 rounded-2xl border border-amber-200/30 bg-amber-300/10 p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-100/80">5 tons já disponíveis</p>
          </div>
          <div className="mt-4 flex gap-2">
            {['Todos','Tenor','Contralto','Soprano'].map((voice) => (
              <span key={voice} className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/70">{voice}</span>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
            <PlayCircle size={20} className="text-violet-300" />
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 bg-cyan-400" /></div>
            <span className="text-[10px] text-white/45">0:52</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function KitArtsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const [kit, settings] = await Promise.all([getKitById(id), getAdminSettings()]);
  if (!kit) notFound();

  const format = query.format === "story" ? "story" : "feed";
  const isStory = format === "story";
  const filename = `harmomus-${format}-${slugify(kit.name)}.png`;
  const coverUrl = kit.cover_url ?? "https://placehold.co/1080x1080/090914/f8fafc?text=Kit+Vocal";
  const artist = kit.artist || "Artista";
  const plan = getPlanLabel(kit.required_plan);
  const logoUrl = settings.branding.logoUrl;

  return (
    <section className="min-h-screen bg-[#02030a] px-4 py-8 text-white print:bg-transparent print:p-0">
      <div className="mx-auto mb-6 flex max-w-6xl flex-col gap-3 print:hidden md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-violet-200">Gerador de artes</p>
          <h1 className="mt-1 text-3xl font-black">Kit vocal disponível</h1>
          <p className="mt-1 text-sm text-zinc-400">Arte premium automática com capa, mockup do app e logo oficial.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href="/admin/kits" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-zinc-100 hover:bg-white/10">Voltar</Link>
          <Link href="?format=feed" className={`rounded-xl px-4 py-2 text-sm font-bold ${!isStory ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Feed 1:1</Link>
          <Link href="?format=story" className={`rounded-xl px-4 py-2 text-sm font-bold ${isStory ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Story 9:16</Link>
          <TestimonialCardDownloadButton filename={filename} />
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl justify-center overflow-auto rounded-3xl border border-white/10 bg-black/30 p-4 print:block print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <article id="testimonial-card" className={`${isStory ? "h-[1920px] w-[1080px] scale-[0.36] p-14" : "h-[1080px] w-[1080px] scale-[0.62] p-10"} relative isolate shrink-0 overflow-hidden rounded-[4rem] border border-violet-300/35 bg-[#03040c] shadow-[0_35px_120px_rgba(0,0,0,0.45)] origin-top print:scale-100 print:rounded-none print:shadow-none`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(124,58,237,.38),transparent_28%),radial-gradient(circle_at_76%_18%,rgba(245,158,11,.2),transparent_25%),linear-gradient(135deg,#03040c_0%,#071020_45%,#04030a_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:54px_54px] opacity-25" />

          <header className="absolute left-10 right-10 top-9 z-30 flex items-center justify-between">
            <HarmomusBrand logoUrl={logoUrl} />
            <div className="rounded-full border border-violet-300/50 bg-violet-500/15 px-6 py-2 text-xl font-black uppercase tracking-[0.18em] text-violet-100">Novidade!</div>
          </header>

          <main className={`${isStory ? "pt-32" : "pt-24"} relative z-10 h-full`}>
            <div className={`${isStory ? "flex h-full flex-col" : "grid h-full grid-cols-[.92fr_1.08fr] gap-8 pb-32"}`}>
              <section className={`${isStory ? "text-center" : "flex flex-col justify-center pb-10"}`}>
                <div className="mb-8 h-px w-full bg-gradient-to-r from-amber-300 via-transparent to-transparent" />
                <p className={`${isStory ? "text-[82px]" : "text-[78px]"} font-black uppercase leading-[.92] tracking-tight text-white`}>Kit vocal</p>
                <p className={`${isStory ? "text-[80px]" : "text-[72px]"} bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text font-black uppercase leading-none tracking-tight text-transparent`}>disponível!</p>
                <p className={`${isStory ? "mt-10" : "mt-8"} text-2xl font-black uppercase tracking-[0.42em] text-amber-200`}>Novo lançamento</p>
                <h2 className={`${isStory ? "mt-10 text-[102px]" : "mt-7 text-[82px]"} font-serif italic leading-none text-amber-200 drop-shadow-[0_0_30px_rgba(245,158,11,.25)]`}>{kit.name}</h2>
                <p className="mt-3 text-2xl font-bold uppercase tracking-[0.38em] text-amber-100/85">{artist}</p>
                <p className={`${isStory ? "mx-auto mt-10 max-w-[760px] text-[38px]" : "mt-7 max-w-[510px] text-3xl"} font-medium leading-tight text-white/88`}>O kit vocal completo para você estudar, ensaiar e ministrar com <span className="font-black text-amber-200">excelência.</span></p>
                <div className={`${isStory ? "mx-auto mt-10 max-w-[760px]" : "mt-7"} flex items-center gap-6 rounded-3xl border border-white/15 bg-black/35 p-5`}>
                  <div className="grid h-20 w-20 place-items-center rounded-2xl bg-violet-500/15 text-violet-300"><Music2 size={44} /></div>
                  <div className="text-left">
                    <p className="text-xl text-white/80">Já disponível na</p>
                    <p className="mt-1 text-[40px] font-black tracking-wide text-violet-300">HARMOMUS<span className="text-amber-200">.COM</span></p>
                  </div>
                </div>
              </section>

              <section className={`${isStory ? "relative mt-12 flex-1" : "relative flex items-center justify-center pb-8"}`}>
                <div className={`${isStory ? "mx-auto h-[820px] w-[820px]" : "h-[820px] w-[560px]"} relative overflow-hidden rounded-[3rem] border border-amber-200/45 bg-black shadow-[0_0_90px_rgba(245,158,11,.18)]`}>
                  <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-transparent to-black/10" />
                </div>

                <div className={`${isStory ? "absolute bottom-0 right-4 scale-110" : "absolute -bottom-2 -right-8"}`}>
                  <PhoneMockup coverUrl={coverUrl} kitName={kit.name} artist={artist} plan={plan} />
                </div>
              </section>

              <footer className={`${isStory ? "mt-10" : "absolute bottom-9 left-10 right-10"} z-20 grid grid-cols-4 gap-4`}>
                <div className="rounded-2xl border border-white/15 bg-black/45 p-4 text-center"><SlidersHorizontal className="mx-auto text-violet-300" /><p className="mt-2 text-lg font-bold">5 tons disponíveis</p></div>
                <div className="rounded-2xl border border-white/15 bg-black/45 p-4 text-center"><UserRound className="mx-auto text-violet-300" /><p className="mt-2 text-lg font-bold">Vozes separadas</p></div>
                <div className="rounded-2xl border border-white/15 bg-black/45 p-4 text-center"><PlayCircle className="mx-auto text-violet-300" /><p className="mt-2 text-lg font-bold">Player inteligente</p></div>
                <div className="rounded-2xl border border-white/15 bg-black/45 p-4 text-center"><Sparkles className="mx-auto text-violet-300" /><p className="mt-2 text-lg font-bold">Harmomus IA</p></div>
              </footer>
            </div>
          </main>

          {!isStory ? (
            <div className="absolute bottom-0 left-0 right-0 z-30 grid grid-cols-[1fr_1.1fr] border-t border-white/10 bg-black/35 px-10 py-5">
              <div className="flex items-center gap-4 border-r border-white/10 pr-8">
                <LockKeyhole className="text-violet-300" size={30} />
                <div>
                  <p className="text-xl font-black uppercase tracking-[0.18em] text-violet-300">Conteúdo premium</p>
                  <p className="text-sm font-bold uppercase tracking-[0.28em] text-white/55">Exclusivo para assinantes</p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-5 pl-8">
                <p className="text-xl font-black uppercase tracking-[0.2em] text-violet-300">Arraste para o lado</p>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-violet-500 text-white"><ArrowRight size={24} /></div>
              </div>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
