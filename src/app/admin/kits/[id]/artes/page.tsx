import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, Music2, SlidersHorizontal, UserRound, PlayCircle } from "lucide-react";

import { TestimonialCardDownloadButton } from "@/components/admin/testimonial-card-download-button";
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

export default async function KitArtsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const kit = await getKitById(id);
  if (!kit) notFound();

  const format = query.format === "story" ? "story" : "feed";
  const isStory = format === "story";
  const filename = `harmomus-${format}-${slugify(kit.name)}.png`;
  const coverUrl = kit.cover_url ?? "https://placehold.co/1080x1080/090914/f8fafc?text=Kit+Vocal";
  const artist = kit.artist || "Artista";
  const plan = getPlanLabel(kit.required_plan);

  return (
    <section className="min-h-screen bg-[#02030a] px-4 py-8 text-white print:bg-transparent print:p-0">
      <div className="mx-auto mb-6 flex max-w-6xl flex-col gap-3 print:hidden md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-violet-200">Gerador de artes</p>
          <h1 className="mt-1 text-3xl font-black">Kit vocal disponível</h1>
          <p className="mt-1 text-sm text-zinc-400">Arte automática baseada na capa, nome, artista e plano do kit.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href="/admin/kits" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-zinc-100 hover:bg-white/10">Voltar</Link>
          <Link href="?format=feed" className={`rounded-xl px-4 py-2 text-sm font-bold ${!isStory ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Feed 1:1</Link>
          <Link href="?format=story" className={`rounded-xl px-4 py-2 text-sm font-bold ${isStory ? "bg-white text-slate-950" : "border border-white/15 text-zinc-100 hover:bg-white/10"}`}>Story 9:16</Link>
          <TestimonialCardDownloadButton filename={filename} />
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl justify-center overflow-auto rounded-3xl border border-white/10 bg-black/30 p-4 print:block print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <article id="testimonial-card" className={`${isStory ? "h-[1920px] w-[1080px] scale-[0.36] p-16" : "h-[1080px] w-[1080px] scale-[0.62] p-10"} relative isolate shrink-0 overflow-hidden rounded-[4rem] border border-violet-300/35 bg-[#03040c] shadow-[0_35px_120px_rgba(0,0,0,0.45)] origin-top print:scale-100 print:rounded-none print:shadow-none`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(124,58,237,.32),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(245,158,11,.18),transparent_24%),linear-gradient(135deg,#03040c_0%,#071020_44%,#04030a_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:54px_54px] opacity-30" />
          <div className="absolute left-8 right-8 top-8 z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/8 ring-1 ring-white/15">
                <Music2 className="text-violet-300" size={30} />
              </div>
              <p className="text-4xl font-black tracking-tight">Harmo<span className="text-violet-300">mus</span></p>
            </div>
            <div className="rounded-full border border-violet-300/50 bg-violet-500/15 px-5 py-2 text-lg font-black uppercase tracking-[0.18em] text-violet-100">Novidade</div>
          </div>

          <div className={`relative z-10 grid h-full ${isStory ? "grid-rows-[auto_1fr_auto] pt-32" : "grid-cols-[.96fr_1.04fr] gap-8 pt-24 pb-32"}`}>
            <div className={`${isStory ? "text-center" : "flex flex-col justify-center pb-16"}`}>
              <div className="mb-8 h-px w-full bg-gradient-to-r from-amber-300 via-transparent to-transparent" />
              <p className={`${isStory ? "text-[74px]" : "text-[76px]"} font-black uppercase leading-[.92] tracking-tight text-white`}>Kit vocal</p>
              <p className={`${isStory ? "text-[72px]" : "text-[70px]"} bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text font-black uppercase leading-none tracking-tight text-transparent`}>disponível!</p>
              <p className={`${isStory ? "mt-10" : "mt-8"} text-2xl font-black uppercase tracking-[0.42em] text-amber-200`}>Novo lançamento</p>
              <h2 className={`${isStory ? "mt-10 text-[92px]" : "mt-7 text-[76px]"} font-serif italic leading-none text-amber-200`}>{kit.name}</h2>
              <p className="mt-3 text-2xl font-bold uppercase tracking-[0.38em] text-amber-100/85">{artist}</p>
              <p className={`${isStory ? "mt-10" : "mt-7"} max-w-[520px] text-3xl font-medium leading-tight text-white/88`}>O kit vocal completo para você estudar, ensaiar e ministrar com <span className="font-black text-amber-200">excelência.</span></p>
              <div className={`${isStory ? "mt-8" : "mt-7"} rounded-3xl border border-white/15 bg-black/35 p-5`}>
                <p className="text-xl text-white/80">Já disponível na</p>
                <p className="mt-1 text-[38px] font-black tracking-wide text-violet-300">HARMOMUS<span className="text-amber-200">.COM</span></p>
              </div>
            </div>

            <div className={`${isStory ? "mt-12" : "relative pb-14"} flex items-center justify-center`}>
              <div className={`${isStory ? "h-[760px] w-[760px]" : "h-[720px] w-[500px]"} relative overflow-hidden rounded-[3rem] border border-amber-200/45 bg-black shadow-[0_0_90px_rgba(245,158,11,.16)]`}>
                <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-transparent to-black/10" />
                <div className="absolute left-8 top-8 rounded-full bg-violet-500 px-4 py-2 text-sm font-black uppercase tracking-[0.18em] text-white">{plan}</div>
                <div className="absolute bottom-8 left-8 right-8 rounded-3xl border border-white/15 bg-black/55 p-5">
                  <p className="text-3xl font-black text-white">{kit.name}</p>
                  <p className="mt-1 text-lg text-white/70">{artist}</p>
                  <div className="mt-4 rounded-2xl border border-amber-200/35 bg-amber-300/10 px-4 py-3 text-center text-amber-100">
                    <span className="text-sm font-bold uppercase tracking-[0.16em]">5 tons já disponíveis</span>
                  </div>
                </div>
              </div>
            </div>

            <footer className={`${isStory ? "mt-10" : "absolute bottom-10 left-10 right-10"} z-20 grid grid-cols-4 gap-4`}>
              <div className="rounded-2xl border border-white/15 bg-black/45 p-4 text-center"><SlidersHorizontal className="mx-auto text-violet-300" /><p className="mt-2 text-lg font-bold">5 tons disponíveis</p></div>
              <div className="rounded-2xl border border-white/15 bg-black/45 p-4 text-center"><UserRound className="mx-auto text-violet-300" /><p className="mt-2 text-lg font-bold">Vozes separadas</p></div>
              <div className="rounded-2xl border border-white/15 bg-black/45 p-4 text-center"><PlayCircle className="mx-auto text-violet-300" /><p className="mt-2 text-lg font-bold">Player inteligente</p></div>
              <div className="rounded-2xl border border-white/15 bg-black/45 p-4 text-center"><Sparkles className="mx-auto text-violet-300" /><p className="mt-2 text-lg font-bold">Qualidade profissional</p></div>
            </footer>
          </div>
        </article>
      </div>
    </section>
  );
}
