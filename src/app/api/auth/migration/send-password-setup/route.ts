import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const supabase = await createClient();

  if (email && email.includes("@")) {
    const admin = createSupabaseAdminClient() as any;
    const { data: existingProfile } = await admin.from("profiles").select("id,email").ilike("email", email).maybeSingle();

    const { data: legacyMember } = await (supabase as any)
      .from("legacy_members")
      .select("id,email,display_name,legacy_plan_slug,legacy_status,migrated,password_created")
      .ilike("email", email)
      .maybeSingle();

    const eligible =
      !!legacyMember &&
      String(legacyMember.legacy_plan_slug ?? "").toLowerCase() === "free" &&
      String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
      (!legacyMember.migrated || !legacyMember.password_created);

    if (eligible) {
      const now = new Date().toISOString();
      let userId = String(existingProfile?.id ?? "");
      if (!userId) {
        let page = 1;
        const perPage = 200;
        let foundId = "";
        while (!foundId) {
          const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
          if (listError || !(usersData?.users?.length > 0)) break;
          const existingUser = (usersData.users ?? []).find((user: any) => String(user.email ?? "").toLowerCase() === email);
          foundId = String(existingUser?.id ?? "");
          if (foundId || (usersData.users?.length ?? 0) < perPage) break;
          page += 1;
        }
        userId = foundId;
      }
      if (!userId) {
        const created = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: legacyMember.display_name ?? "" },
        });
        userId = String(created.data.user?.id ?? "");
      }

      if (userId) {
        await admin.from("profiles").upsert(
          {
            id: userId,
            email,
            full_name: legacyMember.display_name ?? null,
            role: "member",
            migrated_from_pms: true,
            requires_password_setup: true,
            updated_at: now,
          },
          { onConflict: "id" },
        );

        const { data: freePlan } = await admin.from("plans").select("id,slug").eq("slug", "free").maybeSingle();
        if (freePlan?.id) {
          const { data: activeSubscription } = await admin
            .from("subscriptions")
            .select("id")
            .eq("user_id", userId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (activeSubscription?.id) {
            await admin
              .from("subscriptions")
              .update({
                plan_id: freePlan.id,
                gateway: "legacy",
                migrated_from_pms: true,
                updated_at: now,
              })
              .eq("id", activeSubscription.id);
          } else {
            await admin.from("subscriptions").insert({
              user_id: userId,
              plan_id: freePlan.id,
              status: "active",
              gateway: "legacy",
              migrated_from_pms: true,
              updated_at: now,
            });
          }
        }

        const origin = new URL(request.url).origin;
        const callbackUrl = new URL("/auth/confirm", origin);
        callbackUrl.searchParams.set("type", "recovery");
        callbackUrl.searchParams.set("next", "/redefinir-senha?migration=1");

        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });

        if (error) {
          const errorUrl = new URL("/definir-senha-migrada", request.url);
          errorUrl.searchParams.set("email", email);
          errorUrl.searchParams.set("error", error.message);
          return NextResponse.redirect(errorUrl, 303);
        }

        await (supabase as any)
          .from("legacy_members")
          .update({ migrated: true, supabase_user_id: userId, migrated_at: now })
          .ilike("email", email);
      }
    }
  }

  const url = new URL("/cadastro/verifique-email", request.url);
  url.searchParams.set("migration", "1");
  url.searchParams.set("email", email);
  return NextResponse.redirect(url, 303);
}
