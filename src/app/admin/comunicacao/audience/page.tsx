import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { AudienceTable } from "@/components/communication/audience-table";

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await (searchParams ?? Promise.resolve({}));
  return <CommunicationShell title="Audiência" subtitle="CRM de contatos com filtros, paginação e exportação."><AudienceTable searchParams={params} /></CommunicationShell>;
}
