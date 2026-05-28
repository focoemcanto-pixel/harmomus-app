import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ALLOWED_STATUS = ["pending", "reviewing", "approved", "rejected", "done"] as const;

function redirectToAdmin(request: Request, message?: string) {
  const url = new URL("/admin/solicitacoes", request.url);
  if (message) url.searchParams.set("message", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.isAdmin) {
    return redirectToAdmin(request, "Acesso administrativo necessário.");
  }

  const form = await request.formData();
  const requestId = String(form.get("request_id") ?? "").trim();
  const status = String(form.get("status") ?? "").trim();

  if (!requestId || !ALLOWED_STATUS.includes(status as any)) {
    return redirectToAdmin(request, "Status inválido para esta solicitação.");
  }

  const admin = createSupabaseAdminClient() as any;

  const { error } = await admin
    .from("premium_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) {
    return redirectToAdmin(request, error.message || "Não foi possível atualizar o status.");
  }

  return redirectToAdmin(request, "Status atualizado com sucesso.");
}
