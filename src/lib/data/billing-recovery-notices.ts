import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type BillingRecoveryNotice = {
  id: string;
  user_id: string;
  reason: string | null;
  last_payment_at: string | null;
  last_payment_status: string | null;
  dismissed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function getBillingRecoveryNotice(userId?: string | null): Promise<BillingRecoveryNotice | null> {
  if (!userId) return null;

  try {
    const admin = createSupabaseAdminClient() as any;
    const { data, error } = await admin
      .from("billing_recovery_notices")
      .select("id,user_id,reason,last_payment_at,last_payment_status,dismissed_at,created_at,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code !== "42P01") console.error("[billingRecoveryNotice] failed to load notice", error);
      return null;
    }

    return (data as BillingRecoveryNotice | null) ?? null;
  } catch (error) {
    console.error("[billingRecoveryNotice] unexpected failure", error);
    return null;
  }
}

export async function dismissBillingRecoveryNotice(userId: string) {
  const admin = createSupabaseAdminClient() as any;
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from("billing_recovery_notices")
    .select("id")
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (existingError && existingError.code !== "42P01") {
    throw new Error(`Falha ao buscar aviso de cobrança: ${existingError.message}`);
  }

  if (existingError?.code === "42P01") return;

  if (existing?.length) {
    const { error } = await admin
      .from("billing_recovery_notices")
      .update({ dismissed_at: now, updated_at: now })
      .in("id", existing.map((row: { id: string }) => row.id));

    if (error) throw new Error(`Falha ao dispensar aviso de cobrança: ${error.message}`);
    return;
  }

  const { error } = await admin.from("billing_recovery_notices").insert({
    user_id: userId,
    reason: "payment_issue_dismissed",
    last_payment_status: "dismissed",
    dismissed_at: now,
    created_at: now,
    updated_at: now,
  });

  if (error) throw new Error(`Falha ao registrar dispensa do aviso: ${error.message}`);
}
