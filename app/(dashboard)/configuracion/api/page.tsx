import { Suspense } from "react";
import { Spinner } from "@/app/components/ui/spinner";
import { ApiIntegrationsView } from "./_view";

// Envoltorio con Suspense: la vista lee ?tab= con useSearchParams() (el aviso
// de "webhook desactivado" enlaza directo a la pestaña Webhooks).
export default function ApiIntegrationsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Spinner /></div>}>
      <ApiIntegrationsView />
    </Suspense>
  );
}
