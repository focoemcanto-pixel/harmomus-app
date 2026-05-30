import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type LogMinistryActivityInput = {
  ministryId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  description: string;
  metadata?: Record<string, unknown> | null;
};

export async function logMinistryActivity({
  ministryId,
  actorUserId = null,
  actorName = null,
  action,
  entityType = null,
  entityId = null,
  description,
  metadata = {},
}: LogMinistryActivityInput) {
  try {
    const admin = createSupabaseAdminClient() as any;
    const { error } = await admin.from("ministry_activity_logs").insert({
      ministry_id: ministryId,
      actor_user_id: actorUserId,
      actor_name: actorName,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      metadata: metadata ?? {},
    });

    if (error) {
      console.error("[ministry-activity] Falha ao registrar atividade", error);
    }
  } catch (error) {
    console.error("[ministry-activity] Log ignorado", error);
  }
}

export function getActivityActorName(profile?: { full_name?: string | null; email?: string | null } | null) {
  return profile?.full_name?.trim() || profile?.email?.trim() || "Usuário";
}
