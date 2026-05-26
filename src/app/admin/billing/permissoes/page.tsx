import Link from "next/link";
import { ArrowLeft, Check, Info, Minus } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";

const permissions = [
  {
    key: "daily_kit_limit",
    label: "Limite de kits por dia",
    description: "Controla quantos kits diferentes o usuário pode abrir por dia.",
    free: "3 kits/dia",
    plus: "Ilimitado",
    premium: "Ilimitado",
  },
  {
    key: "playlists",
    label: "Playlists",
    description: "Permite criar playlists e salvar kits para estudo organizado.",
    free: false,
    plus: true,
    premium: true,
  },
  {
    key: "pitch_shift",
    label: "Troca de tons / modulação",
    description: "Libera a modulação inteligente do player.",
    free: false,
    plus: false,
    premium: true,
  },
  {
    key: "request_tone",
    label: "Solicitar novos tons",
    description: "Permite pedir versões em tons específicos.",
    free: false,
    plus: false,
    premium: true,
  },
  {
    key: "request_songs",
    label: "Solicitar novas músicas",
    description: "Permite sugerir novos kits vocais para produção.",
    free: false,
    plus: false,
    premium: true,
  },
  {
    key: "premium_kits",
    label: "Kits Plus/Premium",
    description: "Acesso aos kits marcados como exclusivos para planos pagos.",
    free: false,
    plus: true,
    premium: true,
  },
  {
    key: "premium_area",
    label: "Área Premium",
    description: "Acesso às solicitações e recursos avançados do Harmomus Premium.",
    free: false,
    plus: false,
    premium: true,
  },
];

function PermissionValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return (
      <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
        {value}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
        value
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
          : "border-white/10 bg-white/5 text-zinc-500"
      }`}
    >
      {value ? <Check className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
    </span>
  );
}

export default function BillingPermissionsPage() {
  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Permissões dos planos"
          description="Matriz operacional de acesso do Harmomus. Esta tela reflete as regras usadas no app para Free, Plus e Premium."
        />
        <Link
          href="/admin/billing"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Billing
        </Link>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Primeira versão administrativa: a matriz abaixo centraliza a regra de negócio vigente. A próxima etapa é persistir essas permissões em banco para edição dinâmica sem deploy.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface/80 shadow-premium">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-white/10">
                <th className="px-4 py-4 font-medium">Recurso</th>
                <th className="px-4 py-4 font-medium">Free</th>
                <th className="px-4 py-4 font-medium">Plus</th>
                <th className="px-4 py-4 font-medium">Premium</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((item) => (
                <tr key={item.key} className="border-b border-white/5 last:border-none">
                  <td className="px-4 py-4">
                    <p className="font-medium text-white">{item.label}</p>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">{item.description}</p>
                  </td>
                  <td className="px-4 py-4"><PermissionValue value={item.free} /></td>
                  <td className="px-4 py-4"><PermissionValue value={item.plus} /></td>
                  <td className="px-4 py-4"><PermissionValue value={item.premium} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-base font-semibold text-white">Free</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Plano de degustação: acesso limitado aos kits liberados para Free, sem recursos avançados.</p>
        </article>
        <article className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-5">
          <h2 className="text-base font-semibold text-cyan-100">Plus</h2>
          <p className="mt-2 text-sm leading-relaxed text-cyan-100/75">Plano de biblioteca: remove limite diário e libera playlists, mas ainda sem modulação e solicitações.</p>
        </article>
        <article className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-5">
          <h2 className="text-base font-semibold text-violet-100">Premium</h2>
          <p className="mt-2 text-sm leading-relaxed text-violet-100/75">Experiência completa: modulação, solicitações, área premium e recursos avançados do player.</p>
        </article>
      </div>
    </section>
  );
}
