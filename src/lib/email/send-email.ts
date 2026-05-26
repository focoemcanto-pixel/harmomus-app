type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
};

export type SendEmailResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Harmomus <noreply@harmomus.com>";
const SUPPORT_FROM = "Suporte Harmomus <suporte@harmomus.com>";

function getResendApiKey() {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

export function getDefaultEmailFrom() {
  return process.env.HARMOMUS_EMAIL_FROM?.trim() || DEFAULT_FROM;
}

export function getSupportEmailFrom() {
  return process.env.HARMOMUS_SUPPORT_EMAIL_FROM?.trim() || SUPPORT_FROM;
}

export function getSupportInbox() {
  return process.env.HARMOMUS_SUPPORT_INBOX?.trim() || "suporte@harmomus.com";
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = getResendApiKey();

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY ausente. E-mail não enviado.", {
      to: input.to,
      subject: input.subject,
    });
    return { ok: false, error: "RESEND_API_KEY ausente." };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? getDefaultEmailFrom(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
        tags: input.tags,
      }),
    });

    const payload = await response.json().catch(() => ({} as { id?: string; message?: string; error?: string }));

    if (!response.ok) {
      const message = payload.message || payload.error || `Falha ao enviar e-mail: ${response.status}`;
      console.error("[email] Falha no envio", { message, status: response.status });
      return { ok: false, error: message };
    }

    return { ok: true, id: payload.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao enviar e-mail.";
    console.error("[email] Erro inesperado", error);
    return { ok: false, error: message };
  }
}
