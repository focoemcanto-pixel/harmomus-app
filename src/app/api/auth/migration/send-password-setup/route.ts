import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const supabase = await createClient();

  if (email && email.includes("@")) {
    const { data: legacyMember } = await (supabase as any)
      .from("legacy_members")
      .select("id,email,name,legacy_plan_slug,legacy_status,migrated,password_created")
      .ilike("email", email)
      .maybeSingle();

    const eligible =
      !!legacyMember &&
      String(legacyMember.legacy_plan_slug ?? "").toLowerCase() === "free" &&
      String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
      (!legacyMember.migrated || !legacyMember.password_created);

    if (eligible) {
      const admin = createSupabaseAdminClient() as any;
      const now = new Date().toISOString();

      const { data: usersData } = await admin.auth.admin.listUsers();
      const existingUser = (usersData?.users ?? []).find((user: any) => String(user.email ?? "").toLowerCase() === email);

      let userId = String(existingUser?.id ?? "");
      if (!userId) {
        const created = await admin.auth.admin.createUser({
          email,
          email_confirm: false,
          user_metadata: { full_name: legacyMember.name ?? "" },
        });
        userId = String(created.data.user?.id ?? "");
      }

      if (userId) {
        await admin.from("profiles").upsert(
          {
            id: userId,
            email,
            full_name: legacyMember.name ?? null,
            role: "member",
            migrated_from_pms: true,
            requires_password_setup: true,
            updated_at: now,
          },
          { onConflict: "id" },
        );

        const { data: freePlan } = await admin.from("plans").select("id,slug").eq("slug", "free").maybeSingle();
        if (freePlan?.id) {
          await admin.from("subscriptions").upsert(
            {
              user_id: userId,
              plan_id: freePlan.id,
              status: "active",
              gateway: "legacy",
              migrated_from_pms: true,
              updated_at: now,
            },
            { onConflict: "user_id" },
          );
        }

        await (supabase as any)
          .from("legacy_members")
          .update({ migrated: true })
          .ilike("email", email);

        const origin = new URL(request.url).origin;
        const callbackUrl = new URL("/auth/confirm", origin);
        callbackUrl.searchParams.set("type", "recovery");
        callbackUrl.searchParams.set("next", "/redefinir-senha?migration=1");
        await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });
      }
    }
  }

  const url = new URL("/cadastro/verifique-email", request.url);
  url.searchParams.set("migration", "1");
  url.searchParams.set("email", email);
  return NextResponse.redirect(url, 303);
}
