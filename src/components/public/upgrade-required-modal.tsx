"use client";

export function UpgradeRequiredModal({ open, message, onClose }: { open: boolean; message: string; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gold-400/30 bg-surface p-6">
        <h3 className="text-xl font-semibold text-white">Upgrade necessário</h3>
        <p className="mt-2 text-sm text-zinc-300">{message}</p>
        <button onClick={onClose} className="mt-5 rounded-lg border border-gold-400/50 px-4 py-2 text-gold-300">Entendi</button>
      </div>
    </div>
  );
}
