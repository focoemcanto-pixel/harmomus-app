import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { LogsViewer } from "@/components/admin/communications/logs-viewer";

export default function Page() {
  return (
    <CommunicationShell title="Logs" subtitle="Histórico real dos testes, campanhas e eventos da Central de Comunicação.">
      <LogsViewer />
    </CommunicationShell>
  );
}
