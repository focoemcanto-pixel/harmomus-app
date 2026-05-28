"use client";

import { useFormStatus } from "react-dom";

type PlaylistVisibilityToggleProps = {
  playlistId: string;
  isPublic: boolean;
  updateVisibilityAction: (formData: FormData) => Promise<void>;
};

function ToggleSubmitButton({ isPublic }: { isPublic: boolean }) {
  const { pending } = useFormStatus();
  const nextLabel = isPublic ? "Tornar privada" : "Tornar pública";

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={nextLabel}
      title={nextLabel}
    >
      {pending ? "Salvando..." : isPublic ? "Privar" : "Publicar"}
    </button>
  );
}

export function PlaylistVisibilityToggle({ playlistId, isPublic, updateVisibilityAction }: PlaylistVisibilityToggleProps) {
  return (
    <form action={updateVisibilityAction}>
      <input type="hidden" name="playlistId" value={playlistId} />
      <input type="hidden" name="isPublic" value={String(!isPublic)} />
      <ToggleSubmitButton isPublic={isPublic} />
    </form>
  );
}
