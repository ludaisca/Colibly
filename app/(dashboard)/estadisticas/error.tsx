"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/app/components/ui/page-header";
import { ListErrorState } from "@/app/components/ui/list-error-state";

// Si las estadísticas fallan o tardan demasiado (getEstadisticas tiene tope),
// se ve un error con reintento en lugar de los skeletons de loading.tsx para
// siempre. reset() vuelve a pedir el segmento; refresh() vuelve a correr el RSC.
export default function EstadisticasError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="space-y-6">
      <PageHeader title="Estadísticas" />
      <ListErrorState
        message="No pudimos cargar las estadísticas a tiempo. Intenta de nuevo en unos segundos."
        onRetry={() => {
          router.refresh();
          reset();
        }}
      />
    </div>
  );
}
