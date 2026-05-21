import { getPlans } from "@/lib/data/plans";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AssinarPage() {
  const [plans, user] = await Promise.all([getPlans(), getCurrentUser()]);
  return <main className="min-h-screen bg-zinc-950 text-white p-6"><section className="max-w-5xl mx-auto"><h1 className="text-4xl font-bold">Escolha seu plano</h1><p className="text-zinc-400 mt-2">Checkout seguro com Stripe.</p><div className="grid md:grid-cols-3 gap-4 mt-8">{plans.filter(p=>["free","plus","premium"].includes(p.slug)&&p.status==='active').map(plan=><article key={plan.id} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5"><h3 className="text-xl font-semibold">{plan.name}</h3><p className="text-zinc-400">{plan.description}</p><p className="text-3xl mt-4">R$ {(plan.price_cents/100).toFixed(2)}</p>{plan.trial_days>0&&<p className="text-emerald-300">{plan.trial_days} dias de trial</p>}<form action="/api/billing/checkout" method="post" className="mt-4"><input type="hidden" name="plan_id" value={plan.id}/><button className="w-full rounded-lg bg-gold-500/20 border border-gold-500/40 px-4 py-2">{plan.slug==='free'?'Começar grátis':'Assinar agora'}</button></form>{!user&&<p className='text-xs text-zinc-500 mt-2'>Você será redirecionado para login.</p>}</article>)}</div></section></main>
}
