import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureUserAccess } from "@/lib/auth/ensure-user-access";
import { activeHubPremiumGrant } from "@/lib/access/hub-grants";
import { trustedAppUrl } from "@/lib/security/trusted-app-url";

// Internal endpoint for the Foco em Canto HUB (Escola) to grant/revoke Premium that originates in
// the HUB (e.g. BLACK FOCO 2026, 365 days). Auth: dedicated HUB_ENTITLEMENT_TOKEN.
// - Existing account (by profile e-mail, then Auth): reused; password and billing untouched.
// - New account: created in Supabase Auth without any password, then the standard recovery e-mail
//   lets the buyer create their own password (nothing is stored or known by the HUB).
// - Grants live in hub_entitlement_grants: Stripe/Asaas never change them and a HUB revoke only
//   touches its own source_ref.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QA_DOMAIN = "@qa.focoemcanto.invalid";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
function same(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function authorized(request: Request) {
  const expected = process.env.HUB_ENTITLEMENT_TOKEN?.trim() || "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  return expected.length >= 40 && provided.length > 0 && same(provided, expected);
}
function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}
function validDate(value: unknown) {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

async function findAuthUserId(admin: any, email: string) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((user: any) => normalizeEmail(user.email) === email);
    if (found?.id) return String(found.id);
    if (users.length < 200) return null;
  }
  return null;
}

// Fast path: profile by e-mail (indexed table, no Auth scan).
async function findProfileAccount(admin: any, email: string) {
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: profile, error } = await admin.from("profiles").select("id,email").ilike("email", pattern).limit(2);
  if (error) throw new Error("profile_lookup_failed");
  if ((profile ?? []).length > 1) throw new Error("duplicate_profiles_for_email");
  return profile?.[0]?.id ? { userId: String(profile[0].id), hasProfile: true } : null;
}

async function findAccount(admin: any, email: string) {
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: profile, error } = await admin.from("profiles").select("id,email").ilike("email", pattern).limit(2);
  if (error) throw new Error("profile_lookup_failed");
  if ((profile ?? []).length > 1) throw new Error("duplicate_profiles_for_email");
  if (profile?.[0]?.id) return { userId: String(profile[0].id), hasProfile: true };
  const authId = await findAuthUserId(admin, email);
  return authId ? { userId: authId, hasProfile: false } : null;
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ ok: false, error: "unauthorized" }, 401);
  const body = (await request.json().catch(() => null)) as Record<string, any> | null;
  const action = String(body?.action ?? "");
  const email = normalizeEmail(body?.email);
  if (!["grant", "revoke", "qa_cleanup"].includes(action) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "invalid_request" }, 400);
  const admin = createSupabaseAdminClient() as any;

  try {
    if (action === "qa_cleanup") {
      if (!email.endsWith(QA_DOMAIN)) return json({ ok: false, error: "qa_only" }, 403);
      const account = await findAccount(admin, email);
      if (!account) return json({ ok: true, removed: false });
      await admin.from("hub_entitlement_grants").delete().eq("user_id", account.userId);
      await admin.from("hub_identity_links").delete().eq("user_id", account.userId);
      await admin.from("subscriptions").delete().eq("user_id", account.userId);
      await admin.from("profiles").delete().eq("id", account.userId);
      await admin.auth.admin.deleteUser(account.userId);
      return json({ ok: true, removed: true });
    }

    const source = String(body?.source ?? "");
    const sourceRef = String(body?.source_ref ?? "");
    if (!/^[a-z0-9_]{3,40}$/.test(source) || !sourceRef || sourceRef.length > 120) return json({ ok: false, error: "invalid_source" }, 400);

    if (action === "revoke") {
      // HUB grants always belong to a profiled account, so no Auth scan is needed here.
      const account = await findProfileAccount(admin, email);
      if (!account) return json({ ok: true, revoked: 0 });
      const { data, error } = await admin.from("hub_entitlement_grants").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("user_id", account.userId).eq("source", source).eq("source_ref", sourceRef).select("id");
      if (error) throw new Error("revoke_failed");
      const stillPremium = Boolean(await activeHubPremiumGrant(admin, account.userId));
      return json({ ok: true, user_id: account.userId, revoked: (data ?? []).length, other_hub_premium_active: stillPremium });
    }

    // grant
    const startsAt = validDate(body?.starts_at);
    const expiresAt = body?.expires_at === null ? null : validDate(body?.expires_at);
    if (!startsAt || (body?.expires_at !== null && !expiresAt) || body?.plan !== "premium") return json({ ok: false, error: "invalid_grant" }, 400);
    const qa = body?.qa === true;
    if (qa && !email.endsWith(QA_DOMAIN)) return json({ ok: false, error: "qa_only" }, 403);
    // Profile first; Auth is scanned only if createUser reports the e-mail already exists.
    let account = await findProfileAccount(admin, email);

    if (body?.dry_run === true) {
      if (!account) { const authId = await findAuthUserId(admin, email); if (authId) account = { userId: authId, hasProfile: false }; }
      const subs = account ? (await admin.from("subscriptions").select("gateway,status").eq("user_id", account.userId).limit(10)).data ?? [] : [];
      return json({ ok: true, dry_run: true, existing_user: Boolean(account), would_create_user: !account, would_send_access_email: !account, other_origins: subs.map((s: any) => ({ gateway: s.gateway, status: s.status })) });
    }

    let createdUser = false;
    let accessEmailSent = false;
    if (!account) {
      const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: String(body?.name ?? ""), origin: source } });
      if (error || !created?.user?.id) {
        const existing = await findAuthUserId(admin, email);
        if (!existing) throw new Error("create_user_failed");
        account = { userId: existing, hasProfile: false };
      } else {
        account = { userId: String(created.user.id), hasProfile: false };
        createdUser = true;
      }
    }
    if (!account.hasProfile) await ensureUserAccess({ id: account.userId, email, fullName: String(body?.name ?? "") || null, selectedPlanSlug: "free" });

    const hubProfileId = typeof body?.hub_profile_id === "string" && /^[0-9a-f-]{36}$/i.test(body.hub_profile_id) ? body.hub_profile_id : null;
    if (hubProfileId && !qa) {
      await admin.from("hub_identity_links").upsert({ user_id: account.userId, hub_profile_id: hubProfileId, email }, { onConflict: "user_id", ignoreDuplicates: true });
    }
    // Idempotent: the same source_ref never extends or duplicates the grant.
    const { error: grantError } = await admin.from("hub_entitlement_grants").upsert({ user_id: account.userId, plan_slug: "premium", source, source_ref: sourceRef, hub_profile_id: hubProfileId, status: "active", starts_at: startsAt, expires_at: expiresAt }, { onConflict: "source,source_ref,user_id", ignoreDuplicates: true });
    if (grantError) throw new Error("grant_failed");

    if (createdUser && !qa) {
      // First access: the buyer creates their own password through the standard recovery link.
      const callbackUrl = trustedAppUrl("/auth/confirm/callback", request);
      callbackUrl.searchParams.set("type", "recovery");
      callbackUrl.searchParams.set("next", "/redefinir-senha");
      const supabase = await createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });
      accessEmailSent = !error;
    }
    const premium = Boolean(await activeHubPremiumGrant(admin, account.userId));
    return json({ ok: true, user_id: account.userId, created_user: createdUser, access_email_sent: accessEmailSent, hub_premium_active: premium });
  } catch (error) {
    console.error("[hub-entitlements] failed", { action, error: error instanceof Error ? error.message : "unknown" });
    return json({ ok: false, error: error instanceof Error ? error.message.slice(0, 120) : "failed" }, 500);
  }
}
