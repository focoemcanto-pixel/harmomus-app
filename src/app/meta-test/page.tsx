import { MetaFunnelEvent } from "@/components/analytics/meta-funnel-event";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  searchParams: Promise<{ code?: string; campaign?: string }>;
};

export default async function MetaTestPage({ searchParams }: Props) {
  const params = await searchParams;
  const code = String(params.code ?? "").trim();
  const campaign = String(params.campaign ?? code ?? "meta_test").trim() || "meta_test";
  const dedupe = `${campaign}-${Date.now()}`;

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-5 text-white">
      <MetaFunnelEvent
        eventName="Lead"
        customEventName="Lead_free_signup"
        dedupeKey={`test-lead-${dedupe}`}
        params={{ content_name: "Harmomus Meta Test Lead", utm_campaign: campaign, test_event_code: code || undefined }}
      />
      <MetaFunnelEvent
        eventName="CompleteRegistration"
        customEventName="CompleteRegistration_first_login"
        dedupeKey={`test-complete-${dedupe}`}
        params={{ content_name: "Harmomus Meta Test CompleteRegistration", utm_campaign: campaign, test_event_code: code || undefined }}
      />
      <section className="max-w-xl rounded-3xl border border-cyan-400/20 bg-white/[0.04] p-8 text-center shadow-2xl shadow-cyan-950/30">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Meta Test</p>
        <h1 className="mt-3 text-3xl font-semibold">Eventos enviados</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Esta página dispara Lead, Lead_free_signup, CompleteRegistration e CompleteRegistration_first_login no navegador.
        </p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 text-left text-sm text-zinc-300">
          <p><strong className="text-white">Campanha:</strong> {campaign}</p>
          <p><strong className="text-white">Test code:</strong> {code || "sem código"}</p>
        </div>
      </section>
    </main>
  );
}
