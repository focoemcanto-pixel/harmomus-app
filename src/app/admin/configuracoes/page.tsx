import { AdminSettingsForm } from "@/components/admin/admin-settings-form";
import { PageHeader } from "@/components/admin/page-header";
import { getAdminSettings } from "@/lib/data/admin-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConfiguracoesPage() {
  const settings = await getAdminSettings();

  return (
    <section className="space-y-6">
      <PageHeader title="Configurações" description="Central de branding, URLs, pagamentos, storage e home." />
      <AdminSettingsForm settings={settings} />
    </section>
  );
}
