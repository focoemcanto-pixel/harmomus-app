import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { startStripeCheckout } from "@/lib/data/billing";
import { getPlans } from "@/lib/data/plans";
import { trackMarketingEvent } from "@/lib/communications/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

type ResolvedPlan = { id: string; slug: string; name?: string | null };

async function resolvePlan(planIdOrSlug: string): Promise<ResolvedPlan | null> {
  if (!planIdOrSlug) return null;
  const plans = await getPlans();
  const normalized = planIdOrSlug.toLowerCase();
  const matched = plans.find((plan) => plan.id === planIdOrSlug || plan.slug.toLowerCase() === normalized);
  if (matched?.id) return { id: matched.id, slug: matched.slug, name: matched.name };
  const ministryAliases = ["ministry_10", "ministry_20", "ministry_40"];
  if (ministryAliases.includes(normalized)) {
    const ministryPlan = plans.find((p) => p.slug === normalized);
    return ministryPlan?.id ? { id: ministryPlan.id, slug: ministryPlan.slug, name: ministryPlan.name } : null;
  }
  return null;
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

function pagePathFromReferrer(req: Request) {
  const referrer = req.headers.get("referer") || req.headers.get("referrer");
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return `${url.pathname}${url.search}`;
  } catch {
    return referrer.slice(0, 240);
  }
}

function deviceTypeFromRequest(req: Request) {
  const ua = String(req.headers.get("user-agent") ?? "").toLowerCase();
  return /mobile|android|iphone|ipad|ipod/.test(ua) ? "mobile" : "desktop";
}

async function trackCheckoutStarted(input: {
  userId: string;
  plan: ResolvedPlan;
  attribution: Record<string, string>;
  req: Request;
  method: "GET" | "POST";
}) {
  try {
    const supabase = createSupabaseAdminClient() as any;
    await trackMarketingEvent(supabase, {
      userId: input.userId,
      eventKey: "checkout_started",
      eventLabel: "Checkout iniciado",
      channel: "app",
      metadata: {
        plan_id: input.plan.id,
        plan_slug: input.plan.slug,
        plan_name: input.plan.name ?? null,
        attribution: input.attribution,
        method: input.method,
        page_path: pagePathFromReferrer(input.req),
        device_type: deviceTypeFromRequest(input.req),
      },
    });
  } catch (error) {
    console.warn("[billing.checkout] falha ao registrar checkout_started", error);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const planParam = String(form.get("plan") ?? form.get("plan_id") ?? "");
    const plan = await resolvePlan(planParam);
    if (!plan) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });

    const attribution = mergeAttribution(attributionFromReferrer(req), attributionFromForm(form));
    const user = await getCurrentUser();
    if (!user?.email) return NextResponse.redirect(loginRedirectUrl(req, planParam || plan.slug, attribution), { status: 303 });

    await trackCheckoutStarted({ userId: user.id, plan, attribution, req, method: "POST" });

    const requestUrl = new URL(req.url);
    const session = await startStripeCheckout(user.id, user.email, plan.id, requestUrl.origin, attribution);
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  try {
    const planParam = String(url.searchParams.get("plan") ?? "");
    const plan = await resolvePlan(planParam);
    if (!plan) {
      const redirect = new URL("/assinar", req.url);
      redirect.searchParams.set("error", "Plano inválido");
      return NextResponse.redirect(redirect, { status: 303 });
    }

    const attribution = mergeAttribution(attributionFromReferrer(req), attributionFromUrl(url));
    const user = await getCurrentUser();
    if (!user?.email) return NextResponse.redirect(loginRedirectUrl(req, planParam || plan.slug, attribution), { status: 303 });

    await trackCheckoutStarted({ userId: user.id, plan, attribution, req, method: "GET" });

    const session = await startStripeCheckout(user.id, user.email, plan.id, url.origin, attribution);
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    url.pathname = "/assinar";
    url.search = "";
    url.searchParams.set("error", toErrorMessage(error));
    return NextResponse.redirect(url, { status: 303 });
  }
}
