export type WebhookRecipientFallbackData = {
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ResolvedWebhookRecipient = {
  name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  phone_source: "profiles" | "auth_metadata" | "stripe_metadata" | "fallback" | null;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim() || null;
}

export function normalizeWebhookPhone(value?: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function pickMetadataValue(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = cleanText(metadata?.[key]);
    if (value) return value;
  }
  return null;
}

async function getAuthUserMetadata(admin: any, userId: string) {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) {
      console.warn("[webhooks.recipient] Falha ao buscar auth.users.raw_user_meta_data", { userId, error });
      return {} as Record<string, unknown>;
    }
    return (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
  } catch (error) {
    console.warn("[webhooks.recipient] Erro ao buscar auth.users.raw_user_meta_data", { userId, error });
    return {} as Record<string, unknown>;
  }
}

export async function resolveWebhookRecipientForUser(
  admin: any,
  userId: string,
  fallbackData: WebhookRecipientFallbackData = {},
): Promise<ResolvedWebhookRecipient> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,full_name,email,phone")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) console.warn("[webhooks.recipient] Falha ao buscar profiles", { userId, error: profileError });

  const authMetadata = await getAuthUserMetadata(admin, userId);
  const stripeMetadata = fallbackData.metadata ?? {};

  const profilePhone = normalizeWebhookPhone(profile?.phone);
  const authPhone = normalizeWebhookPhone(pickMetadataValue(authMetadata, ["phone", "whatsapp", "mobile", "phone_number"]));
  const metadataPhone = normalizeWebhookPhone(pickMetadataValue(stripeMetadata, ["phone", "whatsapp", "mobile", "phone_number"]));
  const fallbackPhone = normalizeWebhookPhone(fallbackData.phone);

  let phone_source: ResolvedWebhookRecipient["phone_source"] = null;
  const phone = profilePhone ?? authPhone ?? metadataPhone ?? fallbackPhone;
  if (phone === profilePhone && profilePhone) phone_source = "profiles";
  else if (phone === authPhone && authPhone) phone_source = "auth_metadata";
  else if (phone === metadataPhone && metadataPhone) phone_source = "stripe_metadata";
  else if (phone === fallbackPhone && fallbackPhone) phone_source = "fallback";

  return {
    name:
      cleanText(profile?.full_name) ??
      pickMetadataValue(authMetadata, ["full_name", "name"]) ??
      pickMetadataValue(stripeMetadata, ["full_name", "name"]) ??
      cleanText(fallbackData.full_name) ??
      cleanText(fallbackData.name) ?? null,
    email:
      cleanText(profile?.email)?.toLowerCase() ??
      pickMetadataValue(authMetadata, ["email"])?.toLowerCase() ??
      pickMetadataValue(stripeMetadata, ["email", "customer_email"])?.toLowerCase() ??
      cleanText(fallbackData.email)?.toLowerCase() ?? null,
    phone,
    username:
      pickMetadataValue(authMetadata, ["username"]) ??
      pickMetadataValue(stripeMetadata, ["username"]) ??
      cleanText(fallbackData.username) ?? null,
    phone_source,
  };
}
