import { NextResponse } from "next/server";

import { sendEmail } from "@/lib/email/send-email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function appBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || new URL(request.url).origin;
}

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

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email && email.includes("@")) {
    try {
      const admin = createSupabaseAdminClient() as any;
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      if (error) {
        console.error("[auth.password.reset] generateLink failed", { email, error });
      } else {
        const tokenHash = String(data?.properties?.hashed_token ?? "").trim();

        if (!tokenHash) {
          console.error("[auth.password.reset] generated link without hashed token", { email });
        } else {
          const recoveryUrl = new URL("/redefinir-senha", appBaseUrl(request));
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
          }
        }
      }
    } catch (error) {
      console.error("[auth.password.reset] unexpected failure", { email, error });
    }
  }

  return NextResponse.redirect(new URL("/recuperar-senha?success=1", request.url), 303);
}
