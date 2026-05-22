import { redirect } from "next/navigation";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { PublicAppShell } from "@/components/public/public-app-shell";

export default async function ComunidadePage(){const c=await getCurrentUserAccessContext(); if(c.isGuest) redirect('/login'); return <PublicAppShell><main className="min-h-screen bg-background p-6 text-white"><section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-surface/70 p-6"><h1 className="text-2xl font-semibold">Comunidade Harmomus</h1><p className="mt-3 text-zinc-300">TODO: conteúdo da comunidade.</p></section></main></PublicAppShell>;}
