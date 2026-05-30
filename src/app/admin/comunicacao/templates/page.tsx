import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { ModuleStatusCard } from "@/components/admin/communications/module-status-card";

export default function Page() {
  return (
    <CommunicationShell title="Templates" subtitle="Modelos reutilizáveis para padronizar mensagens de campanhas, automações e canais.">
      <ModuleStatusCard
        title="Templates de comunicação"
        description="Área preparada para centralizar mensagens padrão do Harmomus. Enquanto a integração final não está ativa, esta tela deixa claro o escopo do módulo e evita a sensação de funcionalidade quebrada."
        status="in_progress"
        items={[
          "Criar modelos para WhatsApp, e-mail e notificações internas.",
          "Organizar templates por finalidade: boas-vindas, cobrança, renovação, campanha e suporte.",
          "Permitir variáveis dinâmicas como nome, plano, link e data de vencimento.",
          "Usar aprovação antes de liberar templates sensíveis para disparo em massa.",
        ]}
        primaryActionHref="/admin/comunicacao/campaigns"
        primaryActionLabel="Ver campanhas"
      />
    </CommunicationShell>
  );
}
