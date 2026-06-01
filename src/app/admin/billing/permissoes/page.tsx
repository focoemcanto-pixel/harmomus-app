import { Fragment } from "react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ArrowLeft, CheckCircle2, Crown, Save, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { getPlans, updatePlan } from "@/lib/data/plans";
import { setFlashToast } from "@/lib/flash";

const FEATURE_CATALOG = [
  {
    category: "Biblioteca",
    items: [
      { key: "biblioteca_basica", label: "Biblioteca básica", description: "Acesso ao acervo gratuito e conteúdos de entrada." },
      { key: "biblioteca_plus", label: "Biblioteca Plus", description: "Libera kits e conteúdos intermediários." },
      { key: "biblioteca_total", label: "Biblioteca completa", description: "Acesso total aos kits publicados." },
      { key: "kits_premium", label: "Kits premium", description: "Conteúdos exclusivos dos planos premium." },
      { key: "premium_kits", label: "Kits Plus/Premium", description: "Compatibilidade com a permissão antiga de kits exclusivos." },
    ],
  },
  {
    category: "Ferramentas do aluno",
    items: [
      { key: "playlists", label: "Playlists", description: "Permite criar e salvar playlists." },
      { key: "playlists_ilimitadas", label: "Playlists ilimitadas", description: "Remove limites de playlists." },
      { key: "troca_tons", label: "Troca de tons", description: "Libera variações e transposição de tons." },
      { key: "pitch_shift", label: "Troca de tons / modulação", description: "Compatibilidade com a permissão antiga de modulação do player." },
      { key: "solicitar_musicas", label: "Solicitar músicas", description: "Permite pedir novas músicas/kits." },
      { key: "request_songs", label: "Solicitar novas músicas", description: "Compatibilidade com a permissão antiga de solicitação de músicas." },
      { key: "request_tone", label: "Solicitar novos tons", description: "Permite pedir versões em tons específicos." },
      { key: "suporte_prioritario", label: "Suporte prioritário", description: "Prioridade em atendimento e suporte." },
      { key: "early_access", label: "Acesso antecipado", description: "Libera novidades antes do público geral." },
      { key: "premium_area", label: "Área Premium", description: "Libera recursos avançados da experiência premium." },
    ],
  },
  {
    category: "Ministérios",
    items: [
      { key: "ministry", label: "Área ministerial", description: "Libera recursos de gestão para ministérios." },
      { key: "ministry_members", label: "Membros do ministério", description: "Permite cadastrar e gerenciar membros." },
      { key: "ministry_repertoire", label: "Repertórios ministeriais", description: "Permite organizar repertórios por ministério." },
    ],
  },
];

function normalizeFeature(value: unknown) {
  return String(value ?? "").trim();
}

function readFeatures(raw: unknown) {
  if (Array.isArray(raw)) return raw.map(normalizeFeature).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeFeature).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function featureLabel(key: string) {
  const feature = FEATURE_CATALOG.flatMap((group) => group.items).find((item) => item.key === key);
  return feature?.label ?? key.replaceAll("_", " ");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BillingPermissionsPage() {
  const plans = await getPlans();
  const activePlans = plans.filter((plan) => plan.status === "active");
  const catalogFeatures = FEATURE_CATALOG.flatMap((group) => group.items.map((item) => item.key));
  const databaseFeatures = plans.flatMap((plan) => readFeatures(plan.features));
  const unknownFeatures = Array.from(new Set(databaseFeatures.filter((feature) => !catalogFeatures.includes(feature))));
  const allFeatureKeys = Array.from(new Set([...catalogFeatures, ...unknownFeatures]));
  const featuresByPlan = new Map(plans.map((plan) => [plan.id, new Set(readFeatures(plan.features))]));

  async function savePermissions(formData: FormData) {
    "use server";

    const currentPlans = await getPlans();
    const selectedFeatures = new Map<string, string[]>();

    for (const plan of currentPlans) selectedFeatures.set(plan.id, []);

    for (const [key, value] of formData.entries()) {
      if (value !== "on" || !key.startsWith("feature:")) continue;
      const [, planId, featureKey] = key.split(":");
      if (!planId || !featureKey) continue;
      selectedFeatures.get(planId)?.push(featureKey);
    }

    try {
      await Promise.all(
        currentPlans.map((plan) => {
          const features = Array.from(new Set(selectedFeatures.get(plan.id) ?? [])).sort();
          return updatePlan(plan.id, {
            features,
            updated_at: new Date().toISOString(),
          });
        }),
      );

      await setFlashToast("success", "Permissões dos planos atualizadas com sucesso.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível atualizar as permissões.");
    }

    revalidatePath("/admin/billing");
    revalidatePath("/admin/billing/permissoes");
    revalidatePath("/admin/planos");
    revalidatePath("/assinar");
    revalidatePath("/");
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader title="Permissões dos Planos" description="Controle visual do que cada plano libera no Harmomus, salvo diretamente em plans.features." />
        <Link href="/admin/billing" className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Billing
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold-300"><Crown className="h-4 w-4" /> Planos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{plans.length}</p>
          <p className="mt-1 text-sm text-muted">{activePlans.length} ativo(s) para uso.</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Recursos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{allFeatureKeys.length}</p>
          <p className="mt-1 text-sm text-muted">Catálogo + recursos existentes no banco.</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-300"><ShieldCheck className="h-4 w-4" /> Gestão</p>
          <p className="mt-2 text-3xl font-semibold text-white">Dinâmica</p>
          <p className="mt-1 text-sm text-muted">Sem editar JSON manualmente.</p>
        </div>
      </div>

      <form action={savePermissions} className="space-y-6">
        <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
          <div className="border-b border-border/70 bg-gradient-to-br from-surface-muted to-background p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Matriz de permissões</h2>
            <p className="mt-1 text-sm text-muted">Marque o recurso nos planos que devem ter acesso. Ao salvar, o campo <code className="rounded bg-black/30 px-1.5 py-0.5 text-gold-200">plans.features</code> será atualizado.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border/70">
                  <th className="sticky left-0 z-10 bg-surface px-4 py-4 font-medium">Recurso</th>
                  {plans.map((plan) => (
                    <th key={plan.id} className="px-4 py-4 font-medium">
                      <div className="flex flex-col gap-1">
                        <span className="text-white">{plan.name}</span>
                        <span className="normal-case tracking-normal text-muted">{plan.slug} • {plan.status}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_CATALOG.map((group) => (
                  <Fragment key={group.category}>
                    <tr>
                      <td colSpan={plans.length + 1} className="border-y border-border/70 bg-background/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">
                        {group.category}
                      </td>
                    </tr>
                    {group.items.map((feature) => (
                      <tr key={feature.key} className="border-b border-border/50 last:border-none">
                        <td className="sticky left-0 z-10 bg-surface px-4 py-4">
                          <p className="font-medium text-white">{feature.label}</p>
                          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">{feature.description}</p>
                        </td>
                        {plans.map((plan) => {
                          const checked = featuresByPlan.get(plan.id)?.has(feature.key) ?? false;
                          return (
                            <td key={`${plan.id}-${feature.key}`} className="px-4 py-4 align-middle">
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-background px-3 py-2 text-sm text-muted transition hover:border-gold-400/40 hover:text-gold-100">
                                <input type="checkbox" name={`feature:${plan.id}:${feature.key}`} defaultChecked={checked} className="h-4 w-4 rounded border-border bg-background accent-[#d4af37]" />
                                Liberar
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}

                {unknownFeatures.length ? (
                  <tr>
                    <td colSpan={plans.length + 1} className="border-y border-border/70 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                      Recursos não catalogados encontrados no banco
                    </td>
                  </tr>
                ) : null}
                {unknownFeatures.map((featureKey) => (
                  <tr key={featureKey} className="border-b border-border/50 last:border-none">
                    <td className="sticky left-0 z-10 bg-surface px-4 py-4">
                      <p className="font-medium text-white">{featureLabel(featureKey)}</p>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">Recurso encontrado em plans.features e preservado na matriz.</p>
                      <span className="mt-2 inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">Não catalogado</span>
                    </td>
                    {plans.map((plan) => {
                      const checked = featuresByPlan.get(plan.id)?.has(featureKey) ?? false;
                      return (
                        <td key={`${plan.id}-${featureKey}`} className="px-4 py-4 align-middle">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-background px-3 py-2 text-sm text-muted transition hover:border-gold-400/40 hover:text-gold-100">
                            <input type="checkbox" name={`feature:${plan.id}:${featureKey}`} defaultChecked={checked} className="h-4 w-4 rounded border-border bg-background accent-[#d4af37]" />
                            Liberar
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sticky bottom-4 z-20 flex justify-end">
          <button className="inline-flex items-center gap-2 rounded-2xl border border-gold-500/30 bg-gold-500 px-5 py-3 text-sm font-semibold text-black shadow-premium transition hover:bg-gold-400">
            <Save className="h-4 w-4" />
            Salvar permissões
          </button>
        </div>
      </form>
    </section>
  );
}
