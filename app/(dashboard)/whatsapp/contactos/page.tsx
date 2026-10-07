import { redirect } from "next/navigation";

// El directorio de contactos pasó a ser por persona y vive en /contactos. Esta
// ruta solo conserva los enlaces y marcadores antiguos.
export default function LegacyContactsPage() {
  redirect("/contactos");
}
