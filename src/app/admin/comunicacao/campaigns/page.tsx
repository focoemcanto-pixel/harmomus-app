import { CampaignBuilder } from "@/components/admin/communications/campaign-builder";
import { CampaignManager } from "@/components/admin/communications/campaign-manager";
import { CommunicationShell } from "@/components/admin/communications/communication-shell";

type CampaignsPageParams = Record<string, string | string[] | undefined>;
type CampaignsPageSearchParams = Promise<CampaignsPageParams>;

function getFirstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams?: CampaignsPageSearchParams;
}) {
  const params: CampaignsPageParams = await (
    searchParams ?? Promise.resolve({} as CampaignsPageParams)
  );
  const campaignId = getFirstSearchParam(params.campaignId);
  const mode = getFirstSearchParam(params.mode);
  const isBuilder = Boolean(campaignId) || mode === "new" || mode === "create";

  return (
    <CommunicationShell
      title="Campanhas"
      subtitle="Crie campanhas, acompanhe filas, edite mensagens e controle pausas ou cancelamentos de disparos."
      hideNavigation={Boolean(campaignId)}
    >
      {isBuilder ? <CampaignBuilder campaignId={campaignId} /> : <CampaignManager />}
    </CommunicationShell>
  );
}
