import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { ModuleStatusCard } from "@/components/admin/communications/module-status-card";

export default function Page() {
  return (
    <CommunicationShell title="WhatsApp" subtitle="Canal prioritário para relacionamento, avisos operacionais e campanhas do Harmomus.">
      <ModuleStatusCard
        title="Central WhatsApp"
        description="Esta área foi preparada para consolidar todas as integrações e disparos via WhatsApp. O objetivo é transformar mensagens isoladas em uma operação organizada e rastreável."
        status="in_progress"
        items={[
          "Integração com provedores oficiais de WhatsApp Business.",
          "Templates aprovados para campanhas, suporte e renovação de assinatura.",
          "Histórico de disparos, entregas, falhas e respostas.",
          "Segmentação por plano, atividade do usuário e comportamento dentro da plataforma.",
        ]}
        primaryActionHref="/admin/comunicacao/audience"
        primaryActionLabel="Ver audiência"
      />
    </CommunicationShell>
  );
}
