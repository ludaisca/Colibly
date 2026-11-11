"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Banner } from "./banner";
import { nudgeDismissKey } from "@/lib/pipeline/nudge";

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

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(nudgeDismissKey(id, userId, new Date())) === "1";
    } catch {
      // Sin almacenamiento (modo privado): se muestra y el cierre dura lo que la página.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage no existe en el servidor
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
