"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type DeletePlaylistButtonProps = {
  playlistId: string;
  playlistName: string;
  deletePlaylistAction: (formData: FormData) => Promise<void>;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Excluindo..." : "Excluir"}
    </button>
  );
}

export function DeletePlaylistButton({ playlistId, playlistName, deletePlaylistAction }: DeletePlaylistButtonProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form
      action={deletePlaylistAction}
      className="flex items-center gap-2"
      onSubmit={(event) => {
        if (confirmed) return;
        const ok = window.confirm(`Tem certeza que deseja excluir a playlist "${playlistName}"? Essa ação não pode ser desfeita.`);
        if (!ok) {
          event.preventDefault();
          return;
        }
        setConfirmed(true);
      }}
    >
      <input type="hidden" name="playlistId" value={playlistId} />
      <SubmitButton />
    </form>
  );
}
