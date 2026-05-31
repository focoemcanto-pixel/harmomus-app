import { CampaignBuilder } from "@/components/admin/communications/campaign-builder";
import { CommunicationShell } from "@/components/admin/communications/communication-shell";

export default function Page() {
  return (
    <CommunicationShell
      title="Campanhas"
      subtitle="Crie campanhas com segmentação por plano, mídia, preview, envio teste e limites anti-bloqueio."
    >
      <CampaignBuilder />
    </CommunicationShell>
  );
}
