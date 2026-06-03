import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { MessageSquareText, Sparkles, Star } from "lucide-react";

import { formatDateTimeBR } from "@/lib/format-date-time-br";
import {
  buildFeedbackResponseTemplate,
  getPremiumRequestById,
  respondToPremiumFeedback,
  updatePremiumFeedbackTestimonial,
  type FeedbackResponseTone,
} from "@/lib/data/premium-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const toneLabels: Record<FeedbackResponseTone, string> = {
  positive: "Positivo",
  neutral: "Neutro",
  negative: "Crítico",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tone?: FeedbackResponseTone }>;
}

function getSummary(row: any) {
  if (row.type === "feedback") return row.message ?? row.title ?? "Feedback recebido";
  if (row.type === "tone_request") return `${row.title ?? "Kit"} • Tom: ${row.requested_tone ?? "não informado"}`;
  return `${row.title ?? "Música"}${row.artist ? ` • ${row.artist}` : ""}`;
}

export default async function PremiumRequestDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const request = await getPremiumRequestById(id);
  if (!request) notFound();

  const selectedTone: FeedbackResponseTone = query.tone === "negative" || query.tone === "neutral" ? query.tone : "positive";
  const profileName = request.profiles?.full_name ?? "Aluno Harmomus";
  const responseTemplate = request.admin_response || buildFeedbackResponseTemplate(selectedTone, profileName);
  const cardTitle = request.testimonial_card_title || "O que nossos alunos dizem";
  const feedbackText = request.message || getSummary(request);

  async function saveResponse(formData: FormData) {
    "use server";
    const response = String(formData.get("response") ?? "");
    const tone = String(formData.get("tone") ?? "positive") as FeedbackResponseTone;
    await respondToPremiumFeedback(id, { response, tone });
    revalidatePath("/admin/harmomus-premium/solicitacoes");
    revalidatePath(`/admin/harmomus-premium/solicitacoes/${id}`);
  }

  async function saveTestimonial(formData: FormData) {
    "use server";
    await updatePremiumFeedbackTestimonial(id, {
      public: formData.get("testimonial_public") === "on",
      cardTitle: String(formData.get("testimonial_card_title") ?? ""),
      cardStyle: String(formData.get("testimonial_card_style") ?? "premium_dark"),
    });
    revalidatePath("/admin/harmomus-premium/solicitacoes");
    revalidatePath(`/admin/harmomus-premium/solicitacoes/${id}`);
  }

  return (
    <section className="space-y-7">
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-gradient-to-br from-[#172034] via-surface to-[#111827] p-6 shadow-premium md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-gold-300">Solicitação Premium</p>
          <h1 className="mt-2 text-3xl font-black text-white md:text-4xl">Detalhes do feedback</h1>
          <p className="mt-2 text-sm text-muted">Recebido em {formatDateTimeBR(request.created_at)}</p>
        </div>
        <Link href="/admin/harmomus-premium/solicitacoes" className="inline-flex justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-zinc-100 hover:bg-white/10">
          Voltar para solicitações
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="space-y-5 rounded-3xl border border-border bg-surface p-6 shadow-premium">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-white/10 text-2xl">
              {request.profiles?.avatar_url ? <img src={request.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : "👤"}
            </div>
            <div>
              <p className="text-lg font-black text-white">{profileName}</p>
              <p className="text-sm text-muted">{request.profiles?.email ?? "Sem e-mail"}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Mensagem recebida</p>
            <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-7 text-white">{feedbackText}</p>
          </div>

          {request.admin_response ? (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">Resposta enviada ao usuário</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-emerald-50">{request.admin_response}</p>
              <p className="mt-3 text-xs text-emerald-200/80">Respondido em {formatDateTimeBR(request.admin_response_at)}</p>
            </div>
          ) : null}
        </article>

        <div className="space-y-6">
          <form action={saveResponse} className="rounded-3xl border border-border bg-surface p-6 shadow-premium">
            <div className="flex items-center gap-2 text-cyan-200">
              <MessageSquareText size={18} />
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Responder ao usuário</p>
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">Mensagem no painel do aluno</h2>
            <p className="mt-1 text-sm text-muted">Escolha o tom da resposta, ajuste o texto e salve. Essa resposta fica registrada para aparecer ao usuário.</p>

            <div className="mt-5 flex flex-wrap gap-2">
              {(["positive", "neutral", "negative"] as FeedbackResponseTone[]).map((tone) => (
                <Link key={tone} href={`/admin/harmomus-premium/solicitacoes/${id}?tone=${tone}`} className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${selectedTone === tone ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
                  {toneLabels[tone]}
                </Link>
              ))}
            </div>

            <input type="hidden" name="tone" value={selectedTone} />
            <textarea name="response" rows={9} defaultValue={responseTemplate} className="mt-5 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-cyan-300/60" />

            <button className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 text-sm font-black text-slate-950 hover:brightness-110">
              Salvar resposta
            </button>
          </form>

          <form action={saveTestimonial} className="rounded-3xl border border-border bg-surface p-6 shadow-premium">
            <div className="flex items-center gap-2 text-fuchsia-200">
              <Sparkles size={18} />
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Depoimento e cards</p>
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">Transformar feedback em prova social</h2>
            <p className="mt-1 text-sm text-muted">Marque como público e use o gerador de cards para baixar arte de Story ou Feed.</p>

            <label className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-semibold text-zinc-200">
              <input name="testimonial_public" type="checkbox" defaultChecked={Boolean(request.testimonial_public)} className="h-4 w-4" />
              Tornar este feedback disponível como depoimento público
            </label>

            <label className="mt-4 block space-y-2">
              <span className="text-sm font-semibold text-zinc-200">Título do card</span>
              <input name="testimonial_card_title" defaultValue={cardTitle} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-fuchsia-300/60" />
            </label>

            <label className="mt-4 block space-y-2">
              <span className="text-sm font-semibold text-zinc-200">Estilo visual</span>
              <select name="testimonial_card_style" defaultValue={request.testimonial_card_style ?? "premium_dark"} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-fuchsia-300/60">
                <option value="premium_dark">Premium Dark</option>
                <option value="gold_ministry">Gold Ministry</option>
                <option value="cyan_modern">Cyan Modern</option>
              </select>
            </label>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Link href={`/admin/harmomus-premium/solicitacoes/${id}/card?format=story`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/15 px-5 py-3 text-sm font-black text-fuchsia-100 hover:bg-fuchsia-500/25">
                <Star size={16} /> Gerar Story 9:16
              </Link>
              <Link href={`/admin/harmomus-premium/solicitacoes/${id}/card?format=feed`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-500/15 px-5 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-500/25">
                <Star size={16} /> Gerar Feed 1:1
              </Link>
            </div>

            <button className="mt-4 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-zinc-100">
              Salvar configurações do depoimento
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
