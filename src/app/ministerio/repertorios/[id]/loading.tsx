import { Loader2 } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";

export default function LoadingScaleDetail() {
  return (
    <MinistryShell>
      <div className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <Loader2 className="h-4 w-4 animate-spin" /> Abrindo escala
        </div>
        <div className="mt-6 h-12 max-w-xl animate-pulse rounded-2xl bg-white/10" />
        <div className="mt-4 h-5 max-w-2xl animate-pulse rounded-full bg-white/10" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <PremiumPanel><div className="h-48 animate-pulse rounded-3xl bg-white/[0.06]" /></PremiumPanel>
        <PremiumPanel><div className="h-48 animate-pulse rounded-3xl bg-white/[0.06]" /></PremiumPanel>
      </div>
      <PremiumPanel><div className="h-64 animate-pulse rounded-3xl bg-white/[0.06]" /></PremiumPanel>
    </MinistryShell>
  );
}
