type SendMinistryInviteEmailInput = {
  to: string;
  invitedName?: string | null;
  ministryName?: string | null;
  inviteUrl: string;
};

type SendMinistryAccessRemovedEmailInput = {
  to: string;
  invitedName?: string | null;
  ministryName?: string | null;
  premiumUrl: string;
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSender(from: string) {
  if (from.includes("<") && from.includes(">")) return from;
  return `Harmomus <${from}>`;
}

export function buildAbsoluteUrl(path: string, requestUrl?: string) {
  const configuredBaseUrl = getBaseUrl();
  const fallbackBaseUrl = requestUrl ? new URL(requestUrl).origin : "";
  const baseUrl = configuredBaseUrl || fallbackBaseUrl;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function sendResendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<SendMinistryInviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    return { sent: false, skipped: true, reason: "RESEND_API_KEY não configurada", status: null, providerMessageId: null };
  }

  if (!from) {
    return { sent: false, skipped: true, reason: "RESEND_FROM_EMAIL não configurada", status: null, providerMessageId: null };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getSender(from),
        to,
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

export async function sendMinistryInviteEmail(input: SendMinistryInviteEmailInput): Promise<SendMinistryInviteEmailResult> {
  const ministryName = escapeHtml(input.ministryName || "seu ministério");
  const invitedName = escapeHtml(input.invitedName || "Olá");
  const invitedEmail = escapeHtml(input.to);
  const inviteUrl = escapeHtml(input.inviteUrl);

  const subject = `Você recebeu acesso Premium ao Harmomus`;
  const html = `
    <div style="margin:0;padding:0;background:#020617;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#020617;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:28px 14px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#080d1b;border:1px solid #164e63;border-radius:24px;overflow:hidden;">
              <tr>
                <td style="padding:30px 26px 12px 26px;">
                  <div style="font-size:12px;letter-spacing:4px;text-transform:uppercase;color:#67e8f9;font-weight:700;margin-bottom:18px;">Convite Ministerial Harmomus</div>
                  <h1 style="font-size:34px;line-height:1.12;margin:0 0 18px 0;color:#ffffff;font-weight:800;">${invitedName}, você recebeu um acesso Premium</h1>
                  <p style="font-size:16px;line-height:1.7;color:#d4d4d8;margin:0 0 24px 0;">${ministryName} liberou um acesso Premium Ministerial para você estudar kits vocais, tons e nipes dentro do Harmomus.</p>
                </td>
              </tr>
              <tr>
                <td align="left" style="padding:0 26px 26px 26px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td bgcolor="#67e8f9" style="border-radius:14px;background:#67e8f9;">
                        <a href="${inviteUrl}" target="_blank" style="display:inline-block;padding:15px 24px;border-radius:14px;background:#67e8f9;color:#020617;font-size:15px;font-weight:800;text-decoration:none;">Ativar acesso Premium</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 26px 26px 26px;">
                  <div style="border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:18px;background:#050914;color:#d4d4d8;font-size:14px;line-height:1.65;">
                    Este convite é pessoal e vinculado ao e-mail <strong style="color:#ffffff;word-break:break-all;">${invitedEmail}</strong>. Integrantes convidados acessam os kits Premium, mas não podem solicitar novas músicas ou novos tons.
                  </div>
                  <p style="font-size:12px;line-height:1.6;color:#a1a1aa;margin:22px 0 0 0;">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="${inviteUrl}" target="_blank" style="color:#67e8f9;word-break:break-all;">${inviteUrl}</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return sendResendEmail({ to: input.to, subject, html });
}

export async function sendMinistryAccessRemovedEmail(input: SendMinistryAccessRemovedEmailInput): Promise<SendMinistryInviteEmailResult> {
  const ministryName = escapeHtml(input.ministryName || "seu ministério");
  const invitedName = escapeHtml(input.invitedName || "Olá");
  const premiumUrl = escapeHtml(input.premiumUrl);

  const subject = "Seu acesso Premium Ministerial foi encerrado";
  const html = `
    <div style="margin:0;padding:0;background:#020617;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#020617;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:28px 14px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#080d1b;border:1px solid #7f1d1d;border-radius:24px;overflow:hidden;">
              <tr>
                <td style="padding:30px 26px 12px 26px;">
                  <div style="font-size:12px;letter-spacing:4px;text-transform:uppercase;color:#fca5a5;font-weight:700;margin-bottom:18px;">Acesso Ministerial</div>
                  <h1 style="font-size:32px;line-height:1.12;margin:0 0 18px 0;color:#ffffff;font-weight:800;">${invitedName}, seu acesso ministerial foi encerrado</h1>
                  <p style="font-size:16px;line-height:1.7;color:#d4d4d8;margin:0 0 24px 0;">O responsável por ${ministryName} removeu seu acesso Premium Ministerial no Harmomus.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 26px 26px 26px;">
                  <div style="border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:18px;background:#050914;color:#d4d4d8;font-size:14px;line-height:1.65;">
                    Sua conta Harmomus continua existindo normalmente, agora com acesso gratuito. Para continuar usando os recursos Premium, você pode assinar um plano individual.
                  </div>
                </td>
              </tr>
              <tr>
                <td align="left" style="padding:0 26px 30px 26px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td bgcolor="#67e8f9" style="border-radius:14px;background:#67e8f9;">
                        <a href="${premiumUrl}" target="_blank" style="display:inline-block;padding:15px 24px;border-radius:14px;background:#67e8f9;color:#020617;font-size:15px;font-weight:800;text-decoration:none;">Assinar Premium individual</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return sendResendEmail({ to: input.to, subject, html });
}
