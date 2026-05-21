import type { Database } from "@/types/database";

type Plan = Database["public"]["Tables"]["plans"]["Row"];
const api = "https://api.stripe.com/v1";
const key = () => { const v = process.env.STRIPE_SECRET_KEY; if (!v) throw new Error("STRIPE_SECRET_KEY não configurada"); return v; };
async function stripe<T>(path: string, body?: URLSearchParams, method = "POST"): Promise<T> { const res = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/x-www-form-urlencoded" }, body: body?.toString() }); if (!res.ok) throw new Error(`Stripe error ${res.status}`); return res.json() as Promise<T>; }
export function getStripeClient() { return { raw: stripe }; }
export async function getOrCreateCustomer(params:{email:string;userId:string;existingCustomerId?:string|null}){ if(params.existingCustomerId) return params.existingCustomerId; const form=new URLSearchParams({email:params.email,"metadata[user_id]":params.userId}); const c=await stripe<{id:string}>("/customers",form); return c.id; }
export async function createCheckoutSession(input:{customerId:string;priceId:string;successUrl:string;cancelUrl:string;trialDays?:number}){ const f=new URLSearchParams({mode:"subscription",customer:input.customerId,success_url:input.successUrl,cancel_url:input.cancelUrl,"line_items[0][price]":input.priceId,"line_items[0][quantity]":"1",allow_promotion_codes:"true"}); if(input.trialDays)f.set("subscription_data[trial_period_days]",String(input.trialDays)); return stripe<{url:string}>("/checkout/sessions",f); }
export async function createCustomerPortalSession(customerId:string,returnUrl:string){ return stripe<{url:string}>("/billing_portal/sessions",new URLSearchParams({customer:customerId,return_url:returnUrl})); }
export async function cancelSubscription(subscriptionId:string){ return stripe(`/subscriptions/${subscriptionId}/cancel`,new URLSearchParams()); }
export async function getSubscription(subscriptionId:string){ return stripe(`/subscriptions/${subscriptionId}`,undefined,"GET"); }
export async function updateSubscription(subscriptionId:string, priceId:string){ return stripe(`/subscriptions/${subscriptionId}`,new URLSearchParams({"items[0][id]":"si_placeholder","items[0][price]":priceId})); }
export function getPriceByPlan(plan: Pick<Plan,"slug"|"stripe_price_id">){ return plan.slug==='free'?null:plan.stripe_price_id; }
