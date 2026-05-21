import { redirect } from "next/navigation";

export default function LegacyMigracaoRedirect() {
  redirect("/admin/migracao");
}
