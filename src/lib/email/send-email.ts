type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
};

type SendEmailResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";

const DEFAULT_FROM =
  process.env.HARMOMUS_EMAIL_FROM ||
  "Harmomus <noreply@harmomus.com>";

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("[email] RESEND_API_KEY ausente");
    return {
      ok: false,
      error: "RESEND_API_KEY ausente",
    };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from || DEFAULT_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[email] Falha", data);

      return {
        ok: false,
        error: data?.message || "Erro ao enviar e-mail",
      };
    }

    return {
      ok: true,
      id: data.id,
    };
  } catch (error) {
    console.error("[email] Erro inesperado", error);

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro inesperado",
    };
  }
}
