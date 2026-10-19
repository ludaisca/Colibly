import type { Metadata } from "next";
import { StatusPage } from "@/app/components/ui/status-page";
import { Button } from "@/app/components/ui/button";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = { title: "Página no encontrada", robots: { index: false, follow: false } };

// 404 de toda la aplicación (sitio público, acceso y panel).
export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="No encontramos esta página"
      description="Puede que el enlace esté incompleto o que la página ya no exista. Revisa la dirección o vuelve al inicio."
      actions={
        <>
          <Button href="/" size="lg">Ir al inicio</Button>
          <Button href={`mailto:${BRAND_CONTACT_EMAIL}`} variant="secondary" size="lg">Escribir a soporte</Button>
        </>
      }
    />
  );
}
