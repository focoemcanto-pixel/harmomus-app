"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import type { Category, Kit, Plan } from "@/lib/data/kits";

interface KitFormProps {
  mode: "create" | "edit";
  categories: Category[];
  plans: Plan[];
  initialData?: Kit | null;
  action: (formData: FormData) => Promise<void>;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-5 py-2.5 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Salvando..." : mode === "create" ? "Criar kit" : "Salvar alterações"}
    </button>
  );
}

export function KitForm({ mode, categories, plans, initialData, action }: KitFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initialData?.slug));
  const [coverUrl, setCoverUrl] = useState(initialData?.cover_url ?? "");

  const preview = useMemo(() => coverUrl.trim() || "https://placehold.co/800x500/101114/f4f4f5?text=Sem+capa", [coverUrl]);

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-surface p-6 shadow-premium">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-muted">Nome *</span>
          <input
            required
            name="name"
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              if (!slugTouched) setSlug(slugify(next));
            }}
            className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-foreground outline-none ring-gold-400/40 focus:ring"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Slug *</span>
          <input
            required
            name="slug"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
            className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-foreground outline-none ring-gold-400/40 focus:ring"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Artista *</span>
          <input required name="artist" defaultValue={initialData?.artist ?? ""} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Categoria</span>
          <select name="category_id" defaultValue={initialData?.category_id ?? ""} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2">
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="text-muted">Descrição</span>
          <textarea name="description" defaultValue={initialData?.description ?? ""} rows={4} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="text-muted">Capa do kit (URL)</span>
          <input
            name="cover_url"
            value={coverUrl}
            onChange={(event) => setCoverUrl(event.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2"
          />
          <p className="text-xs text-muted">TODO: integrar upload direto para Cloudflare R2 na V2.</p>
          <img src={preview} alt="Preview da capa" className="mt-2 h-44 w-full rounded-lg border border-border object-cover" />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Pasta R2</span>
          <input name="r2_folder" defaultValue={initialData?.r2_folder ?? ""} placeholder="kits/vocais-v1" className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2" />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted">Plano necessário</span>
          <select name="required_plan" defaultValue={initialData?.required_plan ?? ""} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2">
            <option value="">Todos os planos</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.slug}>{plan.name}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-muted md:col-span-2">
          <input name="published" type="checkbox" defaultChecked={initialData?.published ?? false} className="h-4 w-4 rounded border-border bg-surface-muted" />
          Publicado
        </label>
      </div>

      <SubmitButton mode={mode} />
    </form>
  );
}
