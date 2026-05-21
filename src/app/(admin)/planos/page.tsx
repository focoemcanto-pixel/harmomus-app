import { redirect } from "next/navigation";

export default function LegacyPlanosRedirect() {
  redirect("/admin/planos");
}
