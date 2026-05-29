import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { changeSubscriptionPlan } from "@/lib/data/billing";

function redirectToAssinatura(req: Request, params?: { message?: string; error?: string }) {
  const url = new URL("/assinatura", req.url);
  if (params?.message) url.searchParams.set("message", params.message);
  if (params?.error) url.searchParams.set("error", params.error);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const planId = String(form.get("plan_id") ?? "").trim();

    if (!planId) {
      return redirectToAssinatura(req, { error: "Selecione um plano válido para continuar." });
    }

    const user = await getCurrentUser();
    if (!user) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect", "/assinatura");
      return NextResponse.redirect(loginUrl, 303);
    }

    await changeSubscriptionPlan(user.id, planId);
    return redirectToAssinatura(req, { message: "Plano atualizado com sucesso." });
  } catch (error) {
    return redirectToAssinatura(req, {
      error: error instanceof Error ? error.message : "Não foi possível alterar seu plano agora.",
    });
  }
}
