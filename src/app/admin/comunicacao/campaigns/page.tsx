import { CampaignBuilder } from "@/components/admin/communications/campaign-builder";
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

  return (
    <CommunicationShell
      title="Campanhas"
      subtitle="Crie campanhas com segmentação por plano, mídia, preview, envio teste e limites anti-bloqueio."
      hideNavigation={Boolean(campaignId)}
    >
      <CampaignBuilder campaignId={campaignId} />
    </CommunicationShell>
  );
}
