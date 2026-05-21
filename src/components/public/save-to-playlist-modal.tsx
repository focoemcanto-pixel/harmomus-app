"use client";

export function SaveToPlaylistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0f121d] p-6 shadow-premium" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white">Playlists em breve</h3>
        <p className="mt-2 text-sm text-zinc-300">Estamos finalizando esta experiência premium para salvar kits na sua playlist.</p>
        <p className="mt-2 text-xs text-zinc-500">TODO: conectar com playlists do usuário.</p>
        <button className="mt-5 rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm text-gold-300" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
