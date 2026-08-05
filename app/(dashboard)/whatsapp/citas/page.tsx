"use client";

import { Suspense } from "react";
import { Spinner } from "@/app/components/ui/spinner";
import { CitasView } from "./_view";

// CitasView usa useSearchParams() (?contactId=, ?id=) — requiere Suspense,
// mismo patrón que app/(auth)/login/page.tsx.
export default function CitasPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    }>
      <CitasView />
    </Suspense>
  );
}
