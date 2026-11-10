import { Plug } from "lucide-react";
import type { ElementType } from "react";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

// Estado vacío de lo que vive "por número" (respuestas rápidas, campos,
// atributos, plantillas…): sin ningún canal conectado explica por qué está
// bloqueado y lleva a conectarlo, en vez de dejar una pantalla vacía.
export function NeedsChannelEmpty({
  title = "Conecta tu número para empezar",
  description,
  icon = Plug,
  className,
}: {
  title?: string;
  description: string;
  icon?: ElementType;
  className?: string;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      className={className}
      action={<Button href="/whatsapp/cuentas" size="sm">Conectar WhatsApp</Button>}
    />
  );
}
