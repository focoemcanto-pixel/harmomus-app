"use client";

interface UpgradeModalProps {
  open: boolean;
  requiredPlanName: string;
  onClose: () => void;
}

export function UpgradeModal({ open, requiredPlanName, onClose }: UpgradeModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gold-400/30 bg-surface p-6 shadow-premium">
        <h3 className="text-xl font-semibold text-foreground">Desbloqueie todos os tons</h3>
        <p className="mt-2 text-sm text-muted">Este tom faz parte do plano {requiredPlanName}. Faça upgrade para continuar.</p>
        <p className="mt-3 text-xs text-muted">TODO: integrar validação real de assinatura via subscriptions.</p>
        <button onClick={onClose} className="mt-5 rounded-lg border border-gold-400/50 px-4 py-2 text-gold-300">
          Entendi
        </button>
      </div>
    </div>
  );
}
