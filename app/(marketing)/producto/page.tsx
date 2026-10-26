import { redirect } from "next/navigation";

// La vista previa de la landing antigua ya no existe: la raíz es la canónica.
export default function ProductPreviewRedirect() {
  redirect("/");
}
