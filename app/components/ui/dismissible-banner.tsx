"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { bannerDismissKey } from "@/lib/billing/banner-copy";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

// Envoltorio cliente del aviso del plan: con `dismissible`, un botón lo cierra
// durante la sesión (sessionStorage con la fecha de hoy: mañana reaparece). Sin
// `dismissible` (cuenta sin funcionar) no hay botón y no se puede ocultar.
export function DismissibleBanner({ dismissible, className, children }: { dismissible: boolean; className?: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useRunOnChange(() => {
    if (!dismissible) return;
    try {
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
          <Button
            variant="ghost"
            size="icon"
            icon={X}
            aria-label="Cerrar aviso"
            onClick={() => {
              try {
                sessionStorage.setItem(bannerDismissKey(new Date()), "1");
              } catch {
                /* se oculta igual en esta página */
              }
              setHidden(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
