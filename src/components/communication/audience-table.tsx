import { getAudience } from "@/lib/communication/service";

export async function AudienceTable({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const search = typeof searchParams?.q === "string" ? searchParams.q : "";
  const page = Number(typeof searchParams?.page === "string" ? searchParams.page : "1");
  const { rows, count, limit } = await getAudience({ search, page });
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <div className="text-sm text-slate-300">{count} contatos</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="text-left text-slate-400">{["Nome","Email","Telefone","Plano","Status","Opt-ins","Última atividade","Origem","Criado em"].map((h)=><th className="px-2 py-2" key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r)=><tr className="border-t border-white/5 text-slate-200" key={r.id}><td className="px-2 py-2">{r.full_name ?? "-"}</td><td className="px-2 py-2">{r.email ?? "-"}</td><td className="px-2 py-2">{r.phone ?? "-"}</td><td className="px-2 py-2">{r.plano ?? "-"}</td><td className="px-2 py-2">{r.status ?? "-"}</td><td className="px-2 py-2">{r.whatsapp_opt_in ? "WA" : ""} {r.email_opt_in ? "E-mail" : ""}</td><td className="px-2 py-2">{r.last_seen_at ? new Date(r.last_seen_at).toLocaleDateString("pt-BR") : "-"}</td><td className="px-2 py-2">{r.origin ?? "-"}</td><td className="px-2 py-2">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="text-xs text-slate-500">Página {page} · {limit} por página</div>
    </div>
  );
}
