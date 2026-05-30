import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { ModuleStatusCard } from "@/components/admin/communications/module-status-card";

export default function Page() {
  return (
    <CommunicationShell title="E-mails" subtitle="Canal para mensagens transacionais, campanhas segmentadas e relacionamento com assinantes.">
      <ModuleStatusCard
        title="Central de e-mails"
        description="Este módulo organiza a futura operação de e-mails do Harmomus, separando mensagens transacionais, campanhas e comunicações de relacionamento para uma gestão mais segura."
        status="in_progress"
        items={[
          "Mensagens transacionais: cadastro, compra, renovação, cancelamento e recuperação de acesso.",
          "Campanhas segmentadas para usuários free, assinantes ativos e usuários inativos.",
          "Integração futura com templates, variáveis dinâmicas e histórico de envios.",
          "Monitoramento de falhas, entregas e performance por campanha.",
        ]}
        primaryActionHref="/admin/comunicacao/templates"
        primaryActionLabel="Ver templates"
      />
    </CommunicationShell>
  );
}
