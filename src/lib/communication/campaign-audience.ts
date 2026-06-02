import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Channel } from "@/types/communication";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const ALLOWED_PLANS = new Set(["free", "plus", "premium", "ministry"]);

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export type AudienceContact = {
  id: string;
  user_id: string | null;
  source: "current" | "legacy";
  plan: string;
  name: string | null;
  email: string | null;
  phone: string;
  phone_normalized: string;
};

type CurrentSubscription = {
  user_id: string | null;
  status?: string | null;
  plans?: { slug?: string | null; name?: string | null } | null;
};

type CurrentProfile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function cleanPlans(plans: unknown) {
  if (!Array.isArray(plans)) return ["premium", "plus"];
  const selected = plans.map(norm).filter((plan) => ALLOWED_PLANS.has(plan));
  return selected.length ? Array.from(new Set(selected)) : ["premium", "plus"];
}

function pickText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function addContact(map: Map<string, AudienceContact>, contact: AudienceContact) {
  if (!contact.phone_normalized || contact.phone_normalized.length < 12) return false;
  const existing = map.get(contact.phone_normalized);
  if (!existing || (existing.source === "legacy" && contact.source === "current")) {
    map.set(contact.phone_normalized, contact);
    return !existing;
  }
  return false;
}

export async function resolveCampaignAudience(input: { plans?: unknown; includeCurrent?: boolean; includeLegacy?: boolean }) {
  const supabase = createSupabaseAdminClient() as SupabaseAdmin & any;
  const plans = cleanPlans(input.plans);
  const includeCurrent = input.includeCurrent !== false;
  const includeLegacy = input.includeLegacy !== false;
  const contactsByPhone = new Map<string, AudienceContact>();
  let currentRaw = 0;
  let legacyRaw = 0;
  let duplicated = 0;

  if (includeCurrent) {
    const { data: subscriptions, error: subError } = await supabase
      .from("subscriptions")
      .select("user_id,status,plans(slug,name)")
      .in("status", Array.from(ACTIVE_STATUSES));
    if (subError) throw new Error(subError.message);

    const currentSubs = ((subscriptions ?? []) as CurrentSubscription[]).filter((sub) => plans.includes(norm(sub.plans?.slug) || "free"));
    const userIds = Array.from(new Set(currentSubs.map((sub) => sub.user_id).filter(Boolean))) as string[];
    const profilesById = new Map<string, CurrentProfile>();

    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id,full_name,email,phone")
        .in("id", userIds);
      if (profileError) throw new Error(profileError.message);
      for (const profile of (profiles ?? []) as CurrentProfile[]) profilesById.set(profile.id, profile);
    }

    for (const sub of currentSubs) {
      const profile = sub.user_id ? profilesById.get(sub.user_id) : null;
      const phone = normalizePhone(profile?.phone);
      if (!phone) continue;
      currentRaw += 1;
      const added = addContact(contactsByPhone, {
        id: `current:${profile?.id ?? phone}`,
        user_id: profile?.id ?? null,
        source: "current",
        plan: norm(sub.plans?.slug) || "free",
        name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        phone: profile?.phone ?? phone,
        phone_normalized: phone,
      });
      if (!added) duplicated += 1;
    }
  }

  if (includeLegacy) {
    const { data: legacyRows, error: legacyError } = await supabase
      .from("vw_legacy_contacts_enriched")
      .select("*")
      .in("legacy_plan_slug", plans)
      .limit(10000);
    if (legacyError) throw new Error(legacyError.message);

    for (const row of (legacyRows ?? []) as Record<string, unknown>[]) {
      const phone = normalizePhone(row.phone);
      if (!phone) continue;
      legacyRaw += 1;
      const added = addContact(contactsByPhone, {
        id: `legacy:${String(row.id ?? row.legacy_member_id ?? phone)}`,
        user_id: null,
        source: "legacy",
        plan: norm(row.legacy_plan_slug) || "free",
        name: pickText(row, ["full_name", "name", "display_name", "customer_name"]),
        email: pickText(row, ["email", "customer_email"]),
        phone: String(row.phone ?? phone),
        phone_normalized: phone,
      });
      if (!added) duplicated += 1;
    }
  }

  const contacts = Array.from(contactsByPhone.values());
  const byPlan = contacts.reduce<Record<string, number>>((acc, contact) => {
    acc[contact.plan] = (acc[contact.plan] ?? 0) + 1;
    return acc;
  }, {});
  const bySource = contacts.reduce<Record<string, number>>((acc, contact) => {
    acc[contact.source] = (acc[contact.source] ?? 0) + 1;
    return acc;
  }, {});

  return {
    contacts,
    summary: {
      total: contacts.length,
      selectedPlans: plans,
      byPlan,
      bySource,
      currentRaw,
      legacyRaw,
      duplicated,
    },
  };
}

export async function enqueueCampaignContacts(input: { campaignId: string; channel: Channel; message: string; payload?: Record<string, unknown>; contacts: AudienceContact[] }) {
  const supabase = createSupabaseAdminClient() as SupabaseAdmin & any;
  if (!input.contacts.length) return { queued: 0 };
  const rows = input.contacts.map((contact) => ({
    campaign_id: input.campaignId,
    user_id: contact.user_id,
    recipient_name: contact.name,
    recipient_email: contact.email,
    recipient_phone: contact.phone_normalized,
    channel: input.channel,
    status: "pending",
    payload: {
      ...(input.payload ?? {}),
      message: input.message,
      source: contact.source,
      plan: contact.plan,
    },
  }));
  const { error } = await supabase.from("communication_queue").insert(rows);
  if (error) throw new Error(error.message);
  return { queued: rows.length };
}
