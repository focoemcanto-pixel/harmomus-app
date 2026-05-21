import { redirect } from "next/navigation";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export default async function AssinaturaPage(){const c=await getCurrentUserAccessContext(); if(c.isGuest) redirect('/login'); return <main className="min-h-screen bg-background p-6 text-white"><section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-surface/70 p-6"><h1 className="text-2xl font-semibold">Assinatura</h1><p className="mt-3 text-zinc-300">TODO: gestão completa da assinatura.</p></section></main>;}
