"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type DeletePlaylistButtonProps = {
  playlistId: string;
  playlistName: string;
  deletePlaylistAction: (formData: FormData) => Promise<void>;
};

function SubmitButton({ isConfirming, onRequestConfirm }: { isConfirming: boolean; onRequestConfirm: () => void }) {
  const { pending } = useFormStatus();

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={onRequestConfirm}
        className="rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-300 transition hover:bg-red-500/20"
      >
        Excluir
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-red-400/30 bg-red-500/20 px-2 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Excluindo..." : "Confirmar"}
    </button>
  );
}

export function DeletePlaylistButton({ playlistId, playlistName, deletePlaylistAction }: DeletePlaylistButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <form action={deletePlaylistAction} className="flex items-center gap-2">
      <input type="hidden" name="playlistId" value={playlistId} />

      {isConfirming ? (
        <span className="max-w-[140px] truncate text-[11px] text-red-200/80" title={`Excluir ${playlistName}?`}>
          Excluir mesmo?
        </span>
      ) : null}

      <SubmitButton isConfirming={isConfirming} onRequestConfirm={() => setIsConfirming(true)} />

      {isConfirming ? (
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-white/10"
        >
          Cancelar
        </button>
      ) : null}
    </form>
  );
}
