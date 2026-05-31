import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { MediaLibrary } from "@/components/admin/communications/media-library";

export default function Page() {
  return (
    <CommunicationShell title="Biblioteca" subtitle="Cadastre mídias de campanha com preview local e URL pública manual, sem depender de Storage/R2 nesta V1.">
      <MediaLibrary />
    </CommunicationShell>
  );
}
