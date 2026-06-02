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

function attributionFromReferrer(req: Request) {
  const referrer = req.headers.get("referer") || req.headers.get("referrer");
  if (!referrer) return {};

  try {
    return attributionFromUrl(new URL(referrer));
  } catch {
    return {};
  }
}

function mergeAttribution(...sources: Array<Record<string, string>>) {
  const merged: Record<string, string> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value) merged[key] = value;
    }
  }
  return merged;
}

function loginRedirectUrl(req: Request, planSlug: string, attribution: Record<string, string> = {}) {
  const slug = planSlug || "premium";
  const redirect = new URL("/assinar", req.url);
  redirect.searchParams.set("plan", slug);
  for (const [key, value] of Object.entries(attribution)) {
    if (value) redirect.searchParams.set(key, value);
  }
  return new URL(`/login?redirect=${encodeURIComponent(`${redirect.pathname}${redirect.search}`)}`, req.url);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const planParam = String(form.get("plan") ?? form.get("plan_id") ?? "");
    const planId = await resolvePlanId(planParam);
    if (!planId) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });

    const attribution = mergeAttribution(attributionFromReferrer(req), attributionFromForm(form));
    const user = await getCurrentUser();
    if (!user?.email) return NextResponse.redirect(loginRedirectUrl(req, planParam, attribution), { status: 303 });

    const requestUrl = new URL(req.url);
    const session = await startStripeCheckout(user.id, user.email, planId, requestUrl.origin, attribution);
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

    const attribution = mergeAttribution(attributionFromReferrer(req), attributionFromUrl(url));
    const user = await getCurrentUser();
    if (!user?.email) return NextResponse.redirect(loginRedirectUrl(req, planParam, attribution), { status: 303 });

    const session = await startStripeCheckout(user.id, user.email, planId, url.origin, attribution);
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    url.pathname = "/assinar";
    url.search = "";
    url.searchParams.set("error", toErrorMessage(error));
    return NextResponse.redirect(url, { status: 303 });
  }
}
