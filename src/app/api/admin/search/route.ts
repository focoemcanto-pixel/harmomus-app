import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  type: "Kit" | "Categoria" | "Membro" | "Plano";
};

function likeQuery(value: string) {
  return `%${value.replace(/[%_]/g, "").trim()}%`;
}

export async function GET(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (current.isGuest || !current.isAdmin) {
    return NextResponse.json({ results: [] }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = createSupabaseAdminClient() as any;
  const pattern = likeQuery(query);

  const [kitsResponse, categoriesResponse, profilesResponse, plansResponse] = await Promise.all([
    supabase.from("kits").select("id,name,artist,slug,published").or(`name.ilike.${pattern},artist.ilike.${pattern},slug.ilike.${pattern}`).limit(6),
    supabase.from("categories").select("id,name,slug").or(`name.ilike.${pattern},slug.ilike.${pattern}`).limit(5),
    supabase.from("profiles").select("id,full_name,email").or(`full_name.ilike.${pattern},email.ilike.${pattern}`).limit(6),
    supabase.from("plans").select("id,name,slug,status").or(`name.ilike.${pattern},slug.ilike.${pattern}`).limit(4),
  ]);

  const results: SearchResult[] = [];

  for (const kit of kitsResponse.data ?? []) {
    results.push({
      id: `kit-${kit.id}`,
      title: kit.name ?? "Kit sem nome",
      subtitle: `${kit.artist ?? "Artista não informado"} • ${kit.published ? "Publicado" : "Rascunho"}`,
      href: `/admin/kits/${kit.id}/editar`,
      type: "Kit",
    });
  }

  for (const category of categoriesResponse.data ?? []) {
    results.push({
      id: `category-${category.id}`,
      title: category.name ?? "Categoria sem nome",
      subtitle: `/${category.slug ?? "sem-slug"}`,
      href: "/admin/categorias",
      type: "Categoria",
    });
  }

  for (const profile of profilesResponse.data ?? []) {
    results.push({
      id: `profile-${profile.id}`,
      title: profile.full_name ?? profile.email ?? "Membro sem nome",
      subtitle: profile.email ?? "Sem e-mail",
      href: `/admin/membros/${profile.id}`,
      type: "Membro",
    });
  }

  for (const plan of plansResponse.data ?? []) {
    results.push({
      id: `plan-${plan.id}`,
      title: plan.name ?? "Plano sem nome",
      subtitle: `${plan.slug ?? "sem-slug"} • ${plan.status ?? "sem status"}`,
      href: "/admin/planos",
      type: "Plano",
    });
  }

  return NextResponse.json({ results: results.slice(0, 12) });
}
