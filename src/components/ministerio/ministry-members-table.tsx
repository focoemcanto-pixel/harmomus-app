import Link from "next/link";
import { ExternalLink, RotateCcw, Trash2 } from "lucide-react";

import { CopyInviteLink } from "@/components/ministerio/copy-invite-link";
import { WhatsAppInviteLink } from "@/components/ministerio/whatsapp-invite-link";
import { formatDate, PremiumPanel, roleLabel, statusLabel } from "@/components/ministerio/ministry-ui";
import type { MinistryMemberRow } from "@/components/ministerio/types";

function statusClass(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "active") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (normalized === "pending") return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  if (normalized === "invited") return "border-cyan-300/30 bg-cyan-400/10 text-cyan-100";
  if (normalized === "removed") return "border-rose-300/30 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/5 text-zinc-200";
}

export function MinistryMembersTable({ members, canRemove, canManage, ministryName }: { members: MinistryMemberRow[]; canRemove: boolean; canManage: boolean; ministryName: string }) {
  return (
    <PremiumPanel id="integrantes" className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Integrantes</p>
          <h2 className="mt-2 text-2xl font-semibold">Equipe ministerial</h2>
          <p className="mt-1 text-sm text-zinc-400">Gestão premium de acessos, convites e ocupação das vagas contratadas.</p>
        </div>
      </div>

      {members.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="border-y border-white/10 bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-zinc-400">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Função</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Convite</th>
                <th className="px-4 py-3">Aceite</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {members.map((member) => {
                const email = member.profile?.email || member.invited_email || "—";
                const name = member.profile?.full_name || member.invited_name || "Integrante";
                const pending = ["pending", "invited"].includes(String(member.status));
                const invitePath = member.invite_token ? `/convite-ministerio/${member.invite_token}` : null;

                return (
                  <tr key={member.id} className="align-top transition hover:bg-white/[0.035]">
                    <td className="px-4 py-4 font-semibold text-white">{name}</td>
                    <td className="px-4 py-4 text-zinc-300">{email}</td>
                    <td className="px-4 py-4 text-zinc-300">{roleLabel(member.role)}</td>
                    <td className="px-4 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(member.status)}`}>{statusLabel(member.status)}</span></td>
                    <td className="px-4 py-4 text-zinc-400">
                      <div>{formatDate(member.invited_at || member.created_at)}</div>
                      {pending && invitePath ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Link href={invitePath} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-200 underline-offset-4 hover:underline">
                            <ExternalLink className="h-3.5 w-3.5" /> Abrir convite
                          </Link>
                          <CopyInviteLink href={invitePath} />
                          <WhatsAppInviteLink href={invitePath} invitedName={member.invited_name || name} ministryName={ministryName} />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-zinc-400">{member.accepted_at ? formatDate(member.accepted_at) : pending ? "Aguardando" : "—"}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {canManage && pending ? (
                          <form action="/api/ministerio/invite" method="post">
                            <input type="hidden" name="resend_member_id" value={member.id} />
                            <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20" aria-label="Gerar novo convite">
                              <RotateCcw className="h-3.5 w-3.5" /> Gerar novo convite
                            </button>
                          </form>
                        ) : null}
                        {canRemove && member.role !== "owner" && String(member.status) !== "removed" ? (
                          <form action="/api/ministerio/remove" method="post">
                            <input type="hidden" name="member_id" value={member.id} />
                            <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20" aria-label="Remover integrante">
                              <Trash2 className="h-3.5 w-3.5" /> Remover
                            </button>
                          </form>
                        ) : null}
                        {!pending && !(canRemove && member.role !== "owner") ? <span className="text-xs text-zinc-500">—</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="m-5 rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400 md:m-6">
          Nenhum integrante cadastrado ainda.
        </div>
      )}
    </PremiumPanel>
  );
}
