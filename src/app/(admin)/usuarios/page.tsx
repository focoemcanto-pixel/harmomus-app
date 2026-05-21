import { redirect } from "next/navigation";

export default function LegacyUsuariosRedirect() {
  redirect("/admin/usuarios");
}
