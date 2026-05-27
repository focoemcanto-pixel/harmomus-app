import { NextResponse } from "next/server";

import { trackMarketingEvent } from "@/lib/communications/events";
import { formatPhoneBR, normalizePhoneInternational } from "@/lib/communications/phone";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

const PLAN_OPTIONS = ["free", "plus", "premium", "ministry_10"] as const;
type PlanSlug = (typeof PLAN_OPTIONS)[number];
type Field = "form" | "full_name" | "username" | "email" | "phone" | "password" | "confirm_password";

function slugifyUsername(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, ""); }
function safeRedirect(raw: string) { return raw && raw.startsWith("/") ? raw : ""; }
function mapSupabaseError(message: string): { message: string; field: Field } { const lower = message.toLowerCase(); if (lower.includes("already") || lower.includes("registered") || lower.includes("exists") || lower.includes("duplicate")) return { message: "Este e-mail já possui cadastro. Tente entrar ou recuperar a senha.", field: "email" }; if (lower.includes("password") || lower.includes("senha")) return { message: "A senha precisa ter pelo menos 6 caracteres e ser mais segura.", field: "password" }; if (lower.includes("email")) return { message: `Confira o e-mail informado e tente novamente. Detalhe: ${message}`, field: "email" }; return { message: message || "Não foi possível criar a conta.", field: "form" }; }
function buildErrorRedirect(request: Request, input: { plan: string; redirectTo: string; message: string; field: Field; fullName: string; username: string; email: string; phone: string }) { const url = new URL("/cadastro", request.url); url.searchParams.set("plan", input.plan); url.searchParams.set("redirect", input.redirectTo); url.searchParams.set("error", input.message); url.searchParams.set("field", input.field); url.searchParams.set("full_name", input.fullName); url.searchParams.set("username", input.username); url.searchParams.set("email", input.email); url.searchParams.set("phone", input.phone); return NextResponse.redirect(url, 303); }

export async function POST(request: Request) {
const formData = await request.formData(); const fullName = String(formData.get("full_name") ?? "").trim(); const email = String(formData.get("email") ?? "").trim().toLowerCase(); const username = slugifyUsername(String(formData.get("username") ?? "")); const phoneMasked = formatPhoneBR(String(formData.get("phone") ?? "")); const phone = normalizePhoneInternational(phoneMasked); const password = String(formData.get("password") ?? ""); const confirmPassword = String(formData.get("confirm_password") ?? ""); const plan = String(formData.get("plan") ?? "free").toLowerCase() as PlanSlug; const redirectTo = safeRedirect(String(formData.get("redirect") ?? "")); const base = { plan, redirectTo, fullName, username, email, phone: phoneMasked }; const fail = (message: string, field: Field) => buildErrorRedirect(request, { ...base, message, field });
if (!PLAN_OPTIONS.includes(plan)) return fail("Selecione um plano válido.", "form"); if (!fullName) return fail("Informe seu nome.", "full_name"); if (!username) return fail("Informe um nome de usuário válido.", "username"); if (!email || !email.includes("@")) return fail("Confira o e-mail informado e tente novamente.", "email"); if (!phone || phone.replace(/\D/g, "").length < 12) return fail("Informe um WhatsApp válido.", "phone"); if (password.length < 6) return fail("A senha precisa ter pelo menos 6 caracteres.", "password"); if (password !== confirmPassword) return fail("As senhas não conferem.", "confirm_password");
const supabase = await createClient(); const origin = new URL(request.url).origin; const next = plan === "free" ? "/cadastro/sucesso?plan=free" : `/api/billing/checkout?plan=${plan}&welcome=1`;
const { error: createError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, data: { full_name: fullName, username, phone, plan_slug: plan, origin, utm_source: String(formData.get("utm_source") ?? ""), utm_campaign: String(formData.get("utm_campaign") ?? "") } } });
if (!createError) {
  await trackMarketingEvent(supabase as any, { eventType: "signup", channel: "email", metadata: { plan, origin } });
  await dispatchWebhookEvent({
    event: "user.created",
    source: "auth.signup",
    recipient: { name: fullName, email, phone },
    data: { plan, username, origin, utm_source: String(formData.get("utm_source") ?? ""), utm_campaign: String(formData.get("utm_campaign") ?? "") },
  });
}
if (createError) { const mapped = mapSupabaseError(createError.message ?? "Não foi possível criar a conta."); return fail(mapped.message, mapped.field); }
const successUrl = new URL("/cadastro/verifique-email", request.url); successUrl.searchParams.set("email", email); return NextResponse.redirect(successUrl, 303);
}
