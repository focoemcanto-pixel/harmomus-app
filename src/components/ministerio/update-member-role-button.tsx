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
  const label = role === "admin" ? "Promover para Admin" : "Rebaixar para Membro";
  const confirmMessage =
    role === "admin"
      ? `Promover ${memberName} para ${roleLabel("admin")}?`
      : `Rebaixar ${memberName} para ${roleLabel("member")}?`;

  return (
    <form action="/api/ministerio/role" method="post">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="role" value={role} />
      <button
        className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 text-xs font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20"
        aria-label={label}
        data-confirm={confirmMessage}
      >
        {label}
      </button>
    </form>
  );
}
