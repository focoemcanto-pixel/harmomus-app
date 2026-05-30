import { NextResponse } from "next/server";

import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { trackMarketingEvent } from "@/lib/communications/events";
import { formatPhoneBR, normalizePhoneInternational } from "@/lib/communications/phone";
import { startStripeCheckoutForSignup } from "@/lib/data/billing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

const PLAN_OPTIONS = ["free", "plus", "premium", "ministry_10", "ministry_20", "ministry_40"] as const;
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

function getMinistryInviteToken(path: string) {
  const match = path.match(/^\/convite-ministerio\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function getPostSignupNext(plan: PlanSlug, redirectTo: string) {
  const inviteToken = getMinistryInviteToken(redirectTo);
  if (inviteToken) return `/api/ministerio/accept?token=${encodeURIComponent(inviteToken)}`;
  return plan === "free" ? "/cadastro/sucesso?plan=free" : "/checkout/sucesso";
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
    return { message: "Este e-mail já possui cadastro. Entre com este e-mail para aceitar o convite ou recupere sua senha.", field: "email" };
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

async function createConfirmedMinistryMemberAccount(input: {
  request: Request;
  supabase: Awaited<ReturnType<typeof createClient>>;
  token: string;
  email: string;
  password: string;
  fullName: string;
  username: string;
  phone: string;
  plan: PlanSlug;
  origin: string;
}) {
  const admin = createSupabaseAdminClient() as any;
  const now = new Date().toISOString();

  const { data: invite, error: inviteError } = await admin
    .from("ministry_members")
    .select("id,ministry_id,user_id,status,invited_email,role,ministry:ministries(id,status,seat_limit)")
    .eq("invite_token", input.token)
    .maybeSingle();

  if (inviteError || !invite?.id) {
    throw new Error("Convite não encontrado ou expirado.");
  }

  if (!["invited", "pending"].includes(String(invite.status))) {
    throw new Error("Este convite não está mais disponível.");
  }

  const inviteEmail = String(invite.invited_email ?? "").trim().toLowerCase();
  if (inviteEmail !== input.email) {
    throw new Error("Use o mesmo e-mail que recebeu o convite ministerial.");
  }

  if (!invite.ministry?.id || !["active", "trialing"].includes(String(invite.ministry.status ?? "").toLowerCase())) {
    throw new Error("O plano ministerial não está ativo.");
  }

  if (invite.user_id) {
    throw new Error("Este convite já está vinculado a uma conta. Entre com esse e-mail para aceitar.");
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      username: input.username,
      phone: input.phone,
      plan_slug: input.plan,
      origin: input.origin,
      ministry_invite_token: input.token,
    },
  });

  if (createError || !created?.user?.id) {
    const message = String(createError?.message ?? "Não foi possível criar a conta.");
    if (message.toLowerCase().includes("already") || message.toLowerCase().includes("registered") || message.toLowerCase().includes("exists")) {
      throw new Error("Este e-mail já possui conta. Entre com esse e-mail para aceitar o convite ou recupere sua senha.");
    }
    throw new Error(message);
  }

  await ensureUserAccess({
    id: created.user.id,
    email: input.email,
    fullName: input.fullName,
    selectedPlanSlug: "free",
  });

  const { error: memberError } = await admin
    .from("ministry_members")
    .update({
      user_id: created.user.id,
      status: "active",
      accepted_at: now,
      updated_at: now,
    })
    .eq("id", invite.id);

  if (memberError) {
    throw new Error(memberError.message || "Não foi possível ativar o convite ministerial.");
  }

  const { error: loginError } = await input.supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (loginError) {
    const loginUrl = new URL("/login", input.request.url);
    loginUrl.searchParams.set("redirect", "/");
    loginUrl.searchParams.set("message", "Conta criada e convite ativado. Entre com a senha que você acabou de cadastrar.");
    return NextResponse.redirect(loginUrl, 303);
  }

  const target = new URL("/", input.request.url);
  target.searchParams.set("message", "Acesso Premium Ministerial liberado com sucesso.");
  return NextResponse.redirect(target, 303);
}

async function createPaidCheckoutAccount(input: {
  email: string;
  password: string;
  fullName: string;
  username: string;
  phone: string;
  plan: PlanSlug;
  origin: string;
}) {
  const admin = createSupabaseAdminClient() as any;
  const now = new Date().toISOString();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: false,
    user_metadata: {
      full_name: input.fullName,
      username: input.username,
      phone: input.phone,
      plan_slug: input.plan,
      origin: input.origin,
      checkout_flow: "paid_pre_checkout",
    },
  });

  if (createError || !created?.user?.id) {
    const message = String(createError?.message ?? "Não foi possível criar a conta.");
    throw new Error(message);
  }

  await ensureUserAccess({
    id: created.user.id,
    email: input.email,
    fullName: input.fullName,
    selectedPlanSlug: input.plan,
  });

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      onboarding_status: "pending_email_confirmation",
      onboarding_step: "waiting_payment",
      updated_at: now,
    })
    .eq("id", created.user.id);

  if (profileError) throw new Error(profileError.message);

  return created.user.id as string;
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
  const inviteToken = getMinistryInviteToken(redirectTo);
  const isMinistryInviteSignup = Boolean(inviteToken);

  if (isMinistryInviteSignup) {
    try {
      const response = await createConfirmedMinistryMemberAccount({
        request,
        supabase,
        token: inviteToken,
        email,
        password,
        fullName,
        username,
        phone,
        plan,
        origin,
      });

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

      return response;
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Não foi possível ativar o convite ministerial.", "form");
    }
  }

  if (isPaidPlan(plan)) {
    try {
      const userId = await withTimeout(
        createPaidCheckoutAccount({ email, password, fullName, username, phone, plan, origin }),
        5000,
        "createPaidCheckoutAccount",
      );

      const session = await withTimeout(
        startStripeCheckoutForSignup(userId, email, plan, origin),
        10000,
        "startStripeCheckoutForSignup",
      );

      return NextResponse.redirect(session.url, 303);
    } catch (error) {
      const mapped = mapSupabaseError(error instanceof Error ? error.message : "Não foi possível iniciar o checkout agora.");
      return fail(mapped.message, mapped.field);
    }
  }

  const next = getPostSignupNext(plan, redirectTo);
  const { data, error: createError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm/callback?next=${encodeURIComponent(next)}`,
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
    return fail("Sua conta foi criada, mas não conseguimos concluir o acesso automaticamente. Tente entrar novamente.", "form");
  }

  try {
    await withTimeout(
      ensureUserAccess({
        id: userId,
        email,
        fullName,
        selectedPlanSlug: plan,
      }),
      5000,
      "ensureUserAccess",
    );
  } catch (accessError) {
    console.error("[signup] Failed to prepare local user access", accessError);
    return fail(
      accessError instanceof Error ? accessError.message : "Não foi possível preparar sua conta agora.",
      "form",
    );
  }

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

  return NextResponse.redirect(new URL(next, request.url), 303);
}
