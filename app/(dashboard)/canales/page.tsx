import { redirect } from "next/navigation";

// Entrada "Canales" del menú: abre la pestaña de WhatsApp. Cada canal sigue
// en su ruta de siempre (/whatsapp/cuentas, /telegram/cuentas…).
export default function CanalesPage() {
  redirect("/whatsapp/cuentas");
}
