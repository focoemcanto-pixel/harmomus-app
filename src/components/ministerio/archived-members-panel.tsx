import { ArchiveRestore } from "lucide-react";

import { formatDate, PremiumPanel, roleLabel } from "@/components/ministerio/ministry-ui";
import type { MinistryMemberRow } from "@/components/ministerio/types";

function RestoreMemberButton({ memberId }: { memberId: string }) {
  return (
    <form action="/api/ministerio/restore" method="post">
      <input type="hidden" name="member_id" value={memberId} />
      <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20">
        <ArchiveRestore className="h-3.5 w-3.5" /> Restaurar
      </button>
    </form>
  );
}

export function ArchivedMembersPanel({ members, canRestore }: { members: MinistryMemberRow[]; canRestore: boolean }) {
  return (
    <PremiumPanel id="arquivados" className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Arquivados</p>
          <h2 className="mt-2 text-2xl font-semibold">Integrantes removidos</h2>
          <p className="mt-1 text-sm text-zinc-400">Histórico de acessos encerrados. Você pode restaurar um integrante se houver vaga livre no plano.</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-300">
          {members.length} arquivado{members.length === 1 ? "" : "s"}
        </span>
      </div>

      {members.length ? (
        <div className="divide-y divide-white/10">
          {members.map((member) => {
            const email = member.profile?.email || member.invited_email || "—";
            const name = member.profile?.full_name || member.invited_name || "Integrante";
            return (
              <div key={member.id} className="grid gap-4 p-5 md:grid-cols-[1.2fr_0.7fr_0.7fr_auto] md:items-center md:p-6">
                <div>
                  <p className="font-semibold text-white">{name}</p>
                  <p className="mt-1 break-all text-xs text-zinc-400">{email}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Função</p>
                  <p className="mt-1 text-sm text-zinc-200">{roleLabel(member.role)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Removido em</p>
                  <p className="mt-1 text-sm text-zinc-200">{formatDate(member.removed_at || member.updated_at)}</p>
                </div>
                <div className="flex justify-start md:justify-end">
                  {canRestore ? <RestoreMemberButton memberId={member.id} /> : <span className="text-xs text-zinc-500">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="m-5 rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400 md:m-6">
          Nenhum integrante arquivado ainda.
        </div>
      )}
    </PremiumPanel>
  );
}
