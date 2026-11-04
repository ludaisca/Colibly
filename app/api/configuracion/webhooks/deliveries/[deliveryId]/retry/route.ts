import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { replayDelivery } from "@/lib/webhooks/replay";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere, requireOrgId } from "@/lib/tenancy";
import { checkWebhookAccess } from "@/lib/billing/gates";

type Params = { params: Promise<{ deliveryId: string }> };

// Reintento manual de una entrega FAILED (p. ej. tras arreglar el receptor);
// la lógica vive en lib/webhooks/replay.ts (compartida con la API).
export async function POST(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    // Las entregas son del plan Pro: sin esto, una cuenta que bajó a Esencial o Negocio
    // seguiría mandando eventos a sus webhooks viejos con este botón.
    const noHooks = await checkWebhookAccess(await requireOrgId(admin.userId));
    if (noHooks) return noHooks;
    const { deliveryId } = await params;
    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpoint: await orgWhere(admin.userId) },
      select: { id: true, status: true, endpoint: { select: { active: true, disabledAt: true } } },
    });
    if (!delivery) return NextResponse.json({ error: "Entrega no encontrada" }, { status: 404 });
    const result = await replayDelivery(delivery);
    if (!result.ok) {
      const error =
        result.reason === "endpoint_inactive" ? "Activa el webhook antes de reintentar"
        : result.reason === "in_progress" ? "La entrega ya está en proceso"
        : "Solo se reintentan entregas fallidas";
      return NextResponse.json({ error }, { status: 400 });
    }
    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
