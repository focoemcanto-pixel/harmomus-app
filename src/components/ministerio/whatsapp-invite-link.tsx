"use client";

import { MessageCircle } from "lucide-react";

export function WhatsAppInviteLink({ href, invitedName, ministryName }: { href: string; invitedName: string; ministryName: string }) {
  function handleShare() {
    const inviteUrl = href.startsWith("http") ? href : `${window.location.origin}${href}`;
    const text = encodeURIComponent(
      `Olá ${invitedName}!

Você recebeu acesso Premium ao Harmomus através do ministério ${ministryName}.

Clique abaixo para ativar:

${inviteUrl}

Após criar sua conta, seu acesso será liberado automaticamente.`
    );

    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
      aria-label="Enviar convite pelo WhatsApp"
    >
      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
    </button>
  );
}
