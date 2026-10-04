import type { OrganizationStatus } from "@prisma/client";
import { Badge } from "@/app/components/ui/badge";

// Estado de cobro de una organización: la pantalla del plan y el panel de la plataforma.
export const ORG_STATUS_BADGE: Record<OrganizationStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  TRIALING: { label: "En prueba", tone: "info" },
  ACTIVE: { label: "Activo", tone: "success" },
  PAST_DUE: { label: "Pago pendiente", tone: "warning" },
  READ_ONLY: { label: "Solo lectura", tone: "danger" },
  CANCELED: { label: "Cancelado", tone: "danger" },
  SUSPENDED: { label: "Suspendido", tone: "danger" },
};

export function OrgStatusBadge({ status, size }: { status: OrganizationStatus; size?: "sm" | "md" }) {
  const b = ORG_STATUS_BADGE[status];
  return (
    <Badge tone={b.tone} size={size}>
      {b.label}
    </Badge>
  );
}
