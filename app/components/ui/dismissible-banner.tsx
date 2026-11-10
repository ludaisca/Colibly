"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { bannerDismissKey } from "@/lib/billing/banner-copy";

// Envoltorio cliente del aviso del plan: con `dismissible`, un botón lo cierra
// durante la sesión (sessionStorage con la fecha de hoy: mañana reaparece). Sin
// `dismissible` (cuenta sin funcionar) no hay botón y no se puede ocultar.
export function DismissibleBanner({ dismissible, className, children }: { dismissible: boolean; className?: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!dismissible) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lee sessionStorage solo en el cliente
      if (sessionStorage.getItem(bannerDismissKey(new Date())) === "1") setHidden(true);
    } catch {
      /* sin sessionStorage: se queda visible */
    }
  }, [dismissible]);

  if (hidden) return null;
  return (
    <div className={className}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {dismissible && (
          <button
            type="button"
            aria-label="Cerrar aviso"
            className="mt-0.5 shrink-0 rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"
            onClick={() => {
              try {
                sessionStorage.setItem(bannerDismissKey(new Date()), "1");
              } catch {
                /* se oculta igual en esta página */
              }
              setHidden(true);
            }}
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
