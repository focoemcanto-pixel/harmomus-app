"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { roleLabel } from "@/components/ministerio/ministry-ui";

export function UpdateMemberRoleButton({
  memberId,
  role,
  memberName,
}: {
  memberId: string;
  role: "admin" | "member";
  memberName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const label = role === "admin" ? "Promover para Admin" : "Rebaixar para Membro";
  const confirmMessage =
    role === "admin"
      ? `Promover ${memberName} para ${roleLabel("admin")}?`
      : `Rebaixar ${memberName} para ${roleLabel("member")}?`;

  async function updateRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    if (!window.confirm(confirmMessage)) return;

    const formData = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/ministerio/role", {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
            "x-harmomus-action": "fetch",
          },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok === false) throw new Error(data?.message || "Não foi possível atualizar a permissão.");
        setMessage(data?.message || "Permissão atualizada.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a permissão.");
      }
    });
  }

  return (
    <form action="/api/ministerio/role" method="post" onSubmit={updateRole} className="space-y-1">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="role" value={role} />
      <button
        disabled={isPending}
        className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 text-xs font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20 disabled:cursor-wait disabled:opacity-60"
        aria-label={label}
      >
        {isPending ? "Salvando..." : label}
      </button>
      {message ? <p className="max-w-[190px] text-[10px] leading-4 text-zinc-400">{message}</p> : null}
    </form>
  );
}
