import { NextResponse } from "next/server";

import { sendEmail } from "@/lib/email/send-email";
import { trustedAppUrl } from "@/lib/security/trusted-app-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function recoveryEmailHtml(link: string) {
  return `
    <div style="margin:0;background:#07090f;padding:32px 16px;font-family:Arial,sans-serif;color:#f8fafc">
      <div style="max-width:560px;margin:0 auto;border:1px solid #293042;border-radius:20px;background:#111622;padding:32px">
        <h1 style="margin:0 0 12px;font-size:26px">Redefinição de senha</h1>
        <p style="margin:0 0 24px;color:#cbd5e1;line-height:1.6">
          Recebemos uma solicitação para alterar a senha da sua conta Harmomus.
        </p>
        <a href="${link}" style="display:inline-block;border-radius:12px;background:#22d3ee;color:#071018;text-decoration:none;font-weight:700;padding:14px 22px">
          Criar nova senha
        </a>
        <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.5">
          Caso você não tenha solicitado esta alteração, ignore este e-mail. O link é de uso único.
        </p>
      </div>
    </div>
  `;
}

function recoveryResultUrl(request: Request, status: "success" | "error") {
  const url = trustedAppUrl("/recuperar-senha", request);
  if (status === "success") {
    url.searchParams.set("success", "1");
  } else {
    url.searchParams.set("error", "Não foi possível enviar o e-mail de recuperação agora. Tente novamente em alguns instantes.");
  }
  return url;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.redirect(recoveryResultUrl(request, "error"), 303);
  }

  try {
    const admin = createSupabaseAdminClient() as any;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (error) {
      console.error("[auth.password.reset] generateLink failed", {
        email,
        message: error.message,
        code: error.code,
        status: error.status,
      });
      return NextResponse.redirect(recoveryResultUrl(request, "error"), 303);
    }

    const tokenHash = String(data?.properties?.hashed_token ?? "").trim();

    if (!tokenHash) {
      console.error("[auth.password.reset] generated link without hashed token", { email });
      return NextResponse.redirect(recoveryResultUrl(request, "error"), 303);
    }

    const recoveryUrl = trustedAppUrl("/redefinir-senha", request);
    recoveryUrl.searchParams.set("token_hash", tokenHash);
    recoveryUrl.searchParams.set("type", "recovery");

    const sent = await sendEmail({
      to: email,
      subject: "Redefina sua senha no Harmomus",
      html: recoveryEmailHtml(recoveryUrl.toString()),
      text: `Redefina sua senha no Harmomus: ${recoveryUrl.toString()}`,
    });

    if (!sent.ok) {
      console.error("[auth.password.reset] recovery email failed", {
        email,
        error: sent.error,
      });
      return NextResponse.redirect(recoveryResultUrl(request, "error"), 303);
    }

    console.info("[auth.password.reset] recovery email sent", {
      email,
      deliveryId: sent.id ?? null,
    });

    return NextResponse.redirect(recoveryResultUrl(request, "success"), 303);
  } catch (error) {
    console.error("[auth.password.reset] unexpected failure", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(recoveryResultUrl(request, "error"), 303);
  }
}
