import { CommunicationSettings } from "@/components/admin/communications/communication-settings";
import { CommunicationShell } from "@/components/admin/communications/communication-shell";

export default function Page() {
  return (
    <CommunicationShell
      title="Configurações"
      subtitle="Configure provedores de WhatsApp, e-mail, testes e limites de envio para campanhas."
    >
      <CommunicationSettings />
    </CommunicationShell>
  );
}
