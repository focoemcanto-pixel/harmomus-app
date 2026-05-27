import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { DashboardCards } from "@/components/communication/dashboard-cards";

export default function Page() {
  return <CommunicationShell title="Dashboard" subtitle="Visão executiva da operação omnichannel."><DashboardCards /></CommunicationShell>;
}
