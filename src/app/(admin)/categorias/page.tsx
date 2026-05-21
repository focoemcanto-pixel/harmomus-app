import { redirect } from "next/navigation";

export default function LegacyCategoriasRedirect() {
  redirect("/admin/categorias");
}
