type SendMinistryInviteEmailInput = {
  to: string;
  invitedName?: string | null;
  ministryName?: string | null;
  inviteUrl: string;
};

type SendMinistryInviteEmailResult = {
  sent: boolean;
  skipped: boolean;
  reason: string | null;
  providerMessageId?: string | null;
  status?: number | null;
};

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL ||
    process.env.CF_PAGES_URL ||
    ""
  ).replace(/\/$/, "");
}

export function buildAbsoluteUrl(path: string, requestUrl?: string) {
  const configuredBaseUrl = getBaseUrl();
  const fallbackBaseUrl = requestUrl ? new URL(requestUrl).origin : "";
  const baseUrl = configuredBaseUrl || fallbackBaseUrl;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function sendMinistryInviteEmail(input: SendMinistryInviteEmailInput): Promise<SendMinistryInviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    return { sent: false, skipped: true, reason: "RESEND_API_KEY não configurada", status: null, providerMessageId: null };
  }

  if (!from) {
    return { sent: false, skipped: true, reason: "RESEND_FROM_EMAIL não configurada", status: null, providerMessageId: null };
  }

  const ministryName = input.ministryName || "seu ministério";
  const invitedName = input.invitedName || "Olá";

  const subject = `Você recebeu acesso Premium ao Harmomus`;
  const html = `
    <div style="font-family:Arial,sans-serif;background:#020617;padding:32px;color:#fff">
      <div style="max-width:640px;margin:0 auto;background:linear-gradient(135deg,#0b1120,#1b1230,#06111f);border:1px solid rgba(103,232,249,.25);border-radius:28px;padding:32px">
        <p style="letter-spacing:4px;text-transform:uppercase;color:#67e8f9;font-size:12px;margin:0 0 18px">Convite Ministerial Harmomus</p>
        <h1 style="font-size:32px;line-height:1.15;margin:0 0 18px;color:#fff">${invitedName}, você recebeu um acesso Premium</h1>
        <p style="font-size:16px;line-height:1.7;color:#d4d4d8;margin:0 0 24px">
          ${ministryName} liberou um acesso Premium Ministerial para você estudar kits vocais, tons e nipes dentro do Harmomus.
        </p>
        <a href="${input.inviteUrl}" style="display:inline-block;background:linear-gradient(90deg,#67e8f9,#e879f9);color:#020617;font-weight:700;text-decoration:none;border-radius:16px;padding:14px 22px;margin:8px 0 24px">
          Ativar acesso Premium
        </a>
        <div style="border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:16px;background:rgba(0,0,0,.22);color:#d4d4d8;font-size:14px;line-height:1.6">
          Este convite é pessoal e vinculado ao e-mail <strong style="color:#fff">${input.to}</strong>. Integrantes convidados acessam os kits Premium, mas não podem solicitar novas músicas ou novos tons.
        </div>
        <p style="font-size:12px;color:#71717a;margin:24px 0 0">Se o botão não funcionar, copie e cole este link no navegador:<br>${input.inviteUrl}</p>
      </div>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject,
        html,
      }),
    });

    const rawBody = await response.text().catch(() => "");
    let parsedBody: any = null;

    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = null;
    }

    if (!response.ok) {
      return {
        sent: false,
        skipped: false,
        reason: parsedBody?.message || parsedBody?.error || rawBody || `Resend retornou ${response.status}`,
        status: response.status,
        providerMessageId: parsedBody?.id ?? null,
      };
    }

    return {
      sent: true,
      skipped: false,
      reason: null,
      status: response.status,
      providerMessageId: parsedBody?.id ?? null,
    };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "Erro desconhecido ao chamar Resend",
      status: null,
      providerMessageId: null,
    };
  }
}
