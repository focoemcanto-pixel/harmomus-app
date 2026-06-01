import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { startStripeCheckout } from "@/lib/data/billing";
import { getPlans } from "@/lib/data/plans";

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

async function resolvePlanId(planIdOrSlug: string) {
  if (!planIdOrSlug) return "";
  const plans = await getPlans();
  const normalized = planIdOrSlug.toLowerCase();
  const matched = plans.find((plan) => plan.id === planIdOrSlug || plan.slug.toLowerCase() === normalized);
  if (matched?.id) return matched.id;
  const ministryAliases = ["ministry_10", "ministry_20", "ministry_40"];
  if (ministryAliases.includes(normalized)) return plans.find((p) => p.slug === normalized)?.id ?? "";
  return "";
}

function loginRedirectUrl(req: Request, planSlug: string) {
  const slug = planSlug || "premium";
  const redirectPath = `/assinar?plan=${encodeURIComponent(slug)}`;
  return new URL(`/login?redirect=${encodeURIComponent(redirectPath)}`, req.url);
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Não foi possível iniciar o checkout agora. Tente novamente.";
}

function cleanAttributionValue(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, 500);
}

function attributionFromUrl(url: URL) {
  const metadata: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = cleanAttributionValue(url.searchParams.get(key));
    if (value) metadata[key] = value;
  }
  return metadata;
}

function attributionFromForm(form: FormData) {
  const metadata: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = cleanAttributionValue(form.get(key));
    if (value) metadata[key] = value;
  }
  return metadata;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const planParam = String(form.get("plan") ?? form.get("plan_id") ?? "");
    const planId = await resolvePlanId(planParam);
    if (!planId) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });

    const user = await getCurrentUser();
    if (!user?.email) return NextResponse.redirect(loginRedirectUrl(req, planParam), { status: 303 });

    const requestUrl = new URL(req.url);
    const session = await startStripeCheckout(user.id, user.email, planId, requestUrl.origin, attributionFromForm(form));
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  try {
    const planParam = String(url.searchParams.get("plan") ?? "");
    const planId = await resolvePlanId(planParam);
    if (!planId) {
      const redirect = new URL("/assinar", req.url);
      redirect.searchParams.set("error", "Plano inválido");
      return NextResponse.redirect(redirect, { status: 303 });
    }

    const user = await getCurrentUser();
    if (!user?.email) return NextResponse.redirect(loginRedirectUrl(req, planParam), { status: 303 });

    const session = await startStripeCheckout(user.id, user.email, planId, url.origin, attributionFromUrl(url));
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    url.pathname = "/assinar";
    url.search = "";
    url.searchParams.set("error", toErrorMessage(error));
    return NextResponse.redirect(url, { status: 303 });
  }
}
