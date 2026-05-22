import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { startStripeCheckout } from "@/lib/data/billing";
import { getPlans } from "@/lib/data/plans";

async function resolvePlanId(planIdOrSlug: string) {
  if (!planIdOrSlug) return "";
  const plans = await getPlans();
  const normalized = planIdOrSlug.toLowerCase();
  const matched = plans.find((plan) => plan.id === planIdOrSlug || plan.slug.toLowerCase() === normalized);
  return matched?.id ?? "";
}

function loginRedirectUrl(req: Request, planSlug: string) {
  const slug = planSlug || "premium";
  const redirectPath = `/assinar?plan=${encodeURIComponent(slug)}`;
  return new URL(`/login?redirect=${encodeURIComponent(redirectPath)}`, req.url);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const planParam = String(form.get("plan") ?? form.get("plan_id") ?? "");
  const planId = await resolvePlanId(planParam);
  if (!planId) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  const user = await getCurrentUser();
  if (!user?.email) return NextResponse.redirect(loginRedirectUrl(req, planParam), { status: 303 });
  const session = await startStripeCheckout(user.id, user.email, planId);
  return NextResponse.redirect(session.url!, { status: 303 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const planParam = String(url.searchParams.get("plan") ?? "");
  const planId = await resolvePlanId(planParam);
  if (!planId) return NextResponse.redirect(new URL("/assinar", req.url), { status: 303 });
  const user = await getCurrentUser();
  if (!user?.email) return NextResponse.redirect(loginRedirectUrl(req, planParam), { status: 303 });
  const session = await startStripeCheckout(user.id, user.email, planId);
  return NextResponse.redirect(session.url!, { status: 303 });
}
