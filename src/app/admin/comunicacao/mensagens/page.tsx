import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { AutomaticMessagesManager } from "@/components/admin/communications/automatic-messages-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function Page() {
  const admin = createSupabaseAdminClient() as any;
  const [{ data: automations, error }, { data: integration }] = await Promise.all([
    admin
      .from("marketing_automations")
      .select("id,name,description,trigger_event,intent,channel,status,message_template,cta_url,cooldown_hours,metadata")
      .order("priority", { ascending: true }),
    admin
      .from("communication_whatsapp_integrations")
      .select("config")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const defaultTestPhone = String(integration?.config?.testPhone || "5571993392294").replace(/\D/g, "");

  return (
    <CommunicationShell
      title="Mensagens automáticas"
      subtitle="Edite os textos enviados pelos gatilhos do Harmomus, pause fluxos, restaure os padrões e valide cada mensagem em um número de teste antes de colocá-la em produção."
    >
      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          Não foi possível carregar as mensagens: {error.message}
        </div>
      ) : (
        <AutomaticMessagesManager automations={automations ?? []} defaultTestPhone={defaultTestPhone} />
      )}
    </CommunicationShell>
  );
}
