import { NextResponse } from "next/server";

import { requireAdmin, sanitizeText } from "../../../_lib/marketing-api";

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function renderMessage(template: string, input: { name: string; plan: string; link: string; value: string; nextBilling: string }) {
  return template
    .replace(/{{\s*nome\s*}}/gi, input.name || "Marcos")
    .replace(/{{\s*plano\s*}}/gi, input.plan || "Premium")
    .replace(/{{\s*link\s*}}/gi, input.link)
    .replace(/{{\s*valor\s*}}/gi, input.value || "R$ 39,90")
    .replace(/{{\s*proxima_cobranca\s*}}/gi, input.nextBilling || "12/08/2026");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { admin, response, current } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const phone = normalizePhone((body as any).phone);
  const name = sanitizeText((body as any).name) || "Marcos";
  if (phone.length < 12 || phone.length > 15) return NextResponse.json({ error: "Número inválido. Use DDI + DDD + número." }, { status: 400 });

  const [{ data: automation, error: automationError }, { data: integration, error: integrationError }] = await Promise.all([
    admin.from("marketing_automations").select("id,name,trigger_event,message_template,cta_url").eq("id", id).maybeSingle(),
    admin.from("communication_whatsapp_integrations").select("id,provider,config").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (automationError) return NextResponse.json({ error: automationError.message }, { status: 500 });
  if (!automation) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
  if (integrationError) return NextResponse.json({ error: integrationError.message }, { status: 500 });
  if (!integration) return NextResponse.json({ error: "Nenhuma integração de WhatsApp ativa." }, { status: 409 });

  const config = (integration.config ?? {}) as Record<string, unknown>;
  const apiUrl = sanitizeText(config.apiUrl);
  const apiToken = sanitizeText(config.apiToken);
  const instance = sanitizeText(config.instance);
  if (!apiUrl) return NextResponse.json({ error: "Integração ativa sem URL de API." }, { status: 409 });

  const messageTemplate = sanitizeText((body as any).message_template) || automation.message_template;
  const ctaUrl = sanitizeText((body as any).cta_url) || automation.cta_url || "https://harmomus.com";
  const message = renderMessage(messageTemplate, {
    name,
    plan: sanitizeText((body as any).plan) || "Premium",
    link: ctaUrl,
    value: sanitizeText((body as any).value) || "R$ 39,90",
    nextBilling: sanitizeText((body as any).next_billing) || "12/08/2026",
  });

  const payload = {
    to: phone,
    phone,
    number: phone,
    whatsapp: phone,
    recipient: phone,
    recipient_name: name,
    text: message,
    message,
    mensagem: message,
    instance,
    test: true,
    mode: "test",
    source: "harmomus.automatic_message_test",
    automation_id: automation.id,
    trigger_event: automation.trigger_event,
    created_at: new Date().toISOString(),
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
    headers["X-Api-Key"] = apiToken;
    headers["x-api-key"] = apiToken;
    headers.apikey = apiToken;
    headers["api-key"] = apiToken;
  }

  let providerStatus = 0;
  let providerResponse: unknown = null;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const result = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal }).finally(() => clearTimeout(timeout));
    providerStatus = result.status;
    const text = await result.text();
    try { providerResponse = text ? JSON.parse(text) : null; } catch { providerResponse = text.slice(0, 5000); }
    if (!result.ok) errorMessage = `Provedor retornou HTTP ${result.status}.`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Falha ao chamar o provedor.";
  }

  await admin.from("communication_logs").insert({
    user_id: current.profile?.id ?? null,
    channel: "whatsapp",
    provider: integration.provider,
    event: errorMessage ? "communication.test.failed" : "communication.test.sent",
    level: errorMessage ? "error" : "info",
    status: errorMessage ? "failed" : "sent",
    message: errorMessage || `Teste manual enviado: ${automation.name}`,
    request: { ...payload, api_token_present: Boolean(apiToken) },
    response: { status: providerStatus, body: providerResponse },
    details: { automation_id: automation.id, automation_name: automation.name, test: true, recipient_phone: phone },
  });

  if (errorMessage) return NextResponse.json({ error: errorMessage, providerStatus, providerResponse }, { status: 502 });
  return NextResponse.json({ data: { sent: true, phone, provider: integration.provider, providerStatus } });
}
