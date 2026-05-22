"use client";

interface UpgradeModalProps {
  open: boolean;
  requiredPlanName: string;
  onClose: () => void;
}

export function UpgradeModal({ open, requiredPlanName, onClose }: UpgradeModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-fuchsia-300/40 bg-gradient-to-b from-[#100b1e] to-[#0b1020] p-6 shadow-[0_20px_70px_rgba(168,85,247,0.45)] md:p-8">
        <h3 className="text-2xl font-semibold text-white">Desbloqueie a experiência Premium</h3>
        <p className="mt-3 text-sm leading-relaxed text-zinc-200 md:text-base">
          Este recurso faz parte do plano <strong>{requiredPlanName}</strong>. Faça upgrade e libere todos os tons, player completo e recursos avançados para seu ministério.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a href="/assinar?plan=premium" className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 text-sm font-semibold text-slate-950">
            Quero ser Premium
          </a>
          <button onClick={onClose} className="rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white/90">
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
