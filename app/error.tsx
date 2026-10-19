"use client";

import { useEffect } from "react";
import { StatusPage } from "@/app/components/ui/status-page";
import { Button } from "@/app/components/ui/button";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";

// Error inesperado dentro de una página. El mensaje real se queda en la
// consola/registros del servidor: aquí solo mostramos el texto genérico y la
// referencia opaca (digest) que soporte puede buscar en los registros.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      code="Ups"
      title="Algo salió mal de nuestro lado"
      description="No pudimos mostrar esta página. Intenta de nuevo; si el problema sigue, escríbenos y lo revisamos."
      reference={error.digest}
      actions={
        <>
          <Button onClick={() => reset()} size="lg">Intentar de nuevo</Button>
          <Button href="/" variant="secondary" size="lg">Ir al inicio</Button>
          <Button href={`mailto:${BRAND_CONTACT_EMAIL}`} variant="ghost" size="lg">Escribir a soporte</Button>
        </>
      }
    />
  );
}
