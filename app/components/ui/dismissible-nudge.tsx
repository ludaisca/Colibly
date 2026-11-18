"use client";

import { useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Banner } from "./banner";
import { nudgeDismissKey } from "@/lib/pipeline/nudge";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

/**
 * Aviso de "siguiente paso" que la persona puede cerrar: el cierre se recuerda
 * por persona y por día en `localStorage` (al día siguiente vuelve si sigue
 * aplicando). Arranca oculto hasta leer el almacenamiento, para no parpadear
 * un aviso que ya se había cerrado.
 */
export function DismissibleNudge({
  id,
  title,
  action,
  children,
}: {
  /** Identifica el aviso ("embudo-detenidos", "contactos-sin-etiquetas"…). */
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "anon";
  const [visible, setVisible] = useState(false);

  useRunOnChange(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(nudgeDismissKey(id, userId, new Date())) === "1";
    } catch {
      // Sin almacenamiento (modo privado): se muestra y el cierre dura lo que la página.
    }
    setVisible(!dismissed);
  }, [id, userId]);

  if (!visible) return null;
  return (
    <Banner
      tone="info"
      title={title}
      action={action}
      onClose={() => {
        setVisible(false);
        try {
          localStorage.setItem(nudgeDismissKey(id, userId, new Date()), "1");
        } catch {
          // Sin almacenamiento: solo se cierra en esta vista.
        }
      }}
    >
      {children}
    </Banner>
  );
}
