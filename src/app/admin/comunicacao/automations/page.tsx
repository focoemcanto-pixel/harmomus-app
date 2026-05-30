import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { ModuleStatusCard } from "@/components/admin/communications/module-status-card";

export default function Page() {
  return (
    <CommunicationShell title="Automações" subtitle="Regras, gatilhos e jornadas para comunicação automática com usuários e assinantes.">
      <ModuleStatusCard
        title="Motor de automações"
        description="Este módulo centraliza os fluxos automáticos da comunicação. A estrutura visual já indica quais jornadas devem existir antes da integração definitiva com disparos e logs."
        status="in_progress"
        items={[
          "Gatilhos por evento: novo cadastro, compra aprovada, assinatura cancelada e renovação próxima.",
          "Jornadas por canal: WhatsApp, e-mail e campanhas internas.",
          "Controle de frequência para evitar disparos duplicados ou excesso de mensagens.",
          "Integração futura com templates aprovados e histórico de logs.",
        ]}
        primaryActionHref="/admin/comunicacao/logs"
        primaryActionLabel="Ver logs"
      />
    </CommunicationShell>
  );
}
