import { NextResponse } from "next/server";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { trackMarketingEvent } from "@/lib/communications/events";
import { formatPhoneBR, normalizePhoneInternational } from "@/lib/communications/phone";
import { startStripeCheckoutForSignup } from "@/lib/data/billing";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

const PLAN_OPTIONS = ["free", "plus", "premium", "ministry_10"] as const;
type PlanSlug = (typeof PLAN_OPTIONS)[number];
type Field = "form" | "full_name" | "username" | "email" | "phone" | "password" | "confirm_password";

function slugifyUsername(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function safeRedirect(raw: string) {
  return raw && raw.startsWith("/") ? raw : "";
}

function isPaidPlan(plan: PlanSlug) {
  return plan !== "free";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function runSignupSideEffectsAsync(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  plan: PlanSlug;
  origin: string;
  fullName: string;
  email: string;
  phone: string;
  username: string;
  utmSource: string;
  utmCampaign: string;
}) {
  setTimeout(() => {
    void Promise.allSettled([
      trackMarketingEvent(input.supabase as any, {
        eventType: "signup",
        channel: "email",
        metadata: { plan: input.plan, origin: input.origin },
      }),
      dispatchWebhookEvent({
        event: "user.created",
        source: "auth.signup",
        recipient: { name: input.fullName, email: input.email, phone: input.phone },
        data: {
          plan: input.plan,
          username: input.username,
          origin: input.origin,
          utm_source: input.utmSource,
          utm_campaign: input.utmCampaign,
        },
      }),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[signup] Async side effect failed", result.reason);
        }
      }
    });
  }, 0);
}

function mapSupabaseError(message: string): { message: string; field: Field } {
  const lower = message.toLowerCase();
  if (lower.includes("already") || lower.includes("registered") || lower.includes("exists") || lower.includes("duplicate")) {
    return { message: "Este e-mail já possui cadastro. Tente entrar ou recuperar a senha.", field: "email" };
  }
  if (lower.includes("password") || lower.includes("senha")) {
    return { message: "A senha precisa ter pelo menos 6 caracteres e ser mais segura.", field: "password" };
  }
  if (lower.includes("email")) {
    return { message: `Confira o e-mail informado e tente novamente. Detalhe: ${message}`, field: "email" };
  }
  return { message: message || "Não foi possível criar a conta.", field: "form" };
}

function buildErrorRedirect(
  request: Request,
  input: {
    plan: string;
    redirectTo: string;
    message: string;
    field: Field;
    fullName: string;
    username: string;
    email: string;
    phone: string;
  },
) {
  const url = new URL("/cadastro", request.url);
  url.searchParams.set("plan", input.plan);
  url.searchParams.set("redirect", input.redirectTo);
  url.searchParams.set("error", input.message);
  url.searchParams.set("field", input.field);
  url.searchParams.set("full_name", input.fullName);
  url.searchParams.set("username", input.username);
  url.searchParams.set("email", input.email);
  url.searchParams.set("phone", input.phone);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const username = slugifyUsername(String(formData.get("username") ?? ""));
  const phoneMasked = formatPhoneBR(String(formData.get("phone") ?? ""));
  const phone = normalizePhoneInternational(phoneMasked);
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const plan = String(formData.get("plan") ?? "free").toLowerCase() as PlanSlug;
  const redirectTo = safeRedirect(String(formData.get("redirect") ?? ""));
  const utmSource = String(formData.get("utm_source") ?? "");
  const utmCampaign = String(formData.get("utm_campaign") ?? "");
  const base = { plan, redirectTo, fullName, username, email, phone: phoneMasked };
  const fail = (message: string, field: Field) => buildErrorRedirect(request, { ...base, message, field });

  if (!PLAN_OPTIONS.includes(plan)) return fail("Selecione um plano válido.", "form");
  if (!fullName) return fail("Informe seu nome.", "full_name");
  if (!username) return fail("Informe um nome de usuário válido.", "username");
  if (!email || !email.includes("@")) return fail("Confira o e-mail informado e tente novamente.", "email");
  if (!phone || phone.replace(/\D/g, "").length < 12) return fail("Informe um WhatsApp válido.", "phone");
  if (password.length < 6) return fail("A senha precisa ter pelo menos 6 caracteres.", "password");
  if (password !== confirmPassword) return fail("As senhas não conferem.", "confirm_password");

  const supabase = await createClient();
  const origin = new URL(request.url).origin;
  const next = plan === "free" ? "/cadastro/sucesso?plan=free" : "/checkout/sucesso";

  const { data, error: createError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: {
        full_name: fullName,
        username,
        phone,
        plan_slug: plan,
        origin,
        utm_source: utmSource,
        utm_campaign: utmCampaign,
      },
    },
  });

  if (createError) {
    const mapped = mapSupabaseError(createError.message ?? "Não foi possível criar a conta.");
    return fail(mapped.message, mapped.field);
  }

  const userId = data.user?.id;

  if (!userId) {
    return fail("Sua conta foi criada, mas não conseguimos iniciar o checkout automaticamente. Tente entrar e assinar novamente.", "form");
  }

  if (isPaidPlan(plan)) {
    try {
      const session = await withTimeout(
        startStripeCheckoutForSignup(userId, email, plan, origin),
        10000,
        "startStripeCheckoutForSignup",
      );

      runSignupSideEffectsAsync({
        supabase,
        plan,
        origin,
        fullName,
        email,
        phone,
        username,
        utmSource,
        utmCampaign,
      });

      return NextResponse.redirect(session.url, 303);
    } catch (checkoutError) {
      console.error("[signup] Failed to start checkout after paid signup", checkoutError);
      return fail(
        checkoutError instanceof Error ? checkoutError.message : "Não foi possível iniciar o checkout agora.",
        "form",
      );
    }
  }

  await withTimeout(
    ensureUserAccess({
      id: userId,
      email,
      fullName,
      selectedPlanSlug: plan,
    }),
    2500,
    "ensureUserAccess",
  );

  runSignupSideEffectsAsync({
    supabase,
    plan,
    origin,
    fullName,
    email,
    phone,
    username,
    utmSource,
    utmCampaign,
  });

  const successUrl = new URL("/cadastro/verifique-email", request.url);
  successUrl.searchParams.set("email", email);
  return NextResponse.redirect(successUrl, 303);
}
