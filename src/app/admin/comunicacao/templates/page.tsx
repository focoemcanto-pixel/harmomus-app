import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { TemplateManager } from "@/components/admin/communications/template-manager";

export default function Page() {
  return (
    <CommunicationShell title="Templates" subtitle="Modelos reutilizáveis persistentes para WhatsApp e e-mail, com categoria, assunto, corpo e mídia.">
      <TemplateManager />
    </CommunicationShell>
  );
}
