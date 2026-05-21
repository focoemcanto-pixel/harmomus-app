import { redirect } from "next/navigation";

export default function LegacyKitsRedirect() {
  redirect("/admin/kits");
}
