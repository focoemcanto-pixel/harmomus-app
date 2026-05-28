"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type RenamePlaylistFormProps = {
  playlistId: string;
  playlistName: string;
  renamePlaylistAction: (formData: FormData) => Promise<void>;
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Salvando..." : "Salvar"}
    </button>
  );
}

export function RenamePlaylistForm({ playlistId, playlistName, renamePlaylistAction }: RenamePlaylistFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(playlistName);

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10"
        aria-label={`Editar nome da playlist ${playlistName}`}
        title="Editar nome"
      >
        Editar nome
      </button>
    );
  }

  return (
    <form action={renamePlaylistAction} className="flex min-w-[220px] flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="playlistId" value={playlistId} />
      <input
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={80}
        className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/40"
        placeholder="Nome da playlist"
        autoFocus
      />
      <SaveButton />
      <button
        type="button"
        onClick={() => {
          setName(playlistName);
          setIsEditing(false);
        }}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-white/10"
      >
        Cancelar
      </button>
    </form>
  );
}
