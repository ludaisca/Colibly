import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webhookDeliveryQueue } from "@/lib/queue";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere, requireOrgId } from "@/lib/tenancy";
import { checkWebhookAccess } from "@/lib/billing/gates";

type Params = { params: Promise<{ deliveryId: string }> };

// Reintento manual de una entrega FAILED (p. ej. tras arreglar el receptor).
// jobId nuevo: el original ya existe en BullMQ como job terminado y un add con
// el mismo id se ignoraría.
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
      select: { id: true, status: true, endpoint: { select: { active: true } } },
    });
    if (!delivery) return NextResponse.json({ error: "Entrega no encontrada" }, { status: 404 });
    if (delivery.status !== "FAILED") return NextResponse.json({ error: "Solo se reintentan entregas fallidas" }, { status: 400 });
    if (!delivery.endpoint.active) return NextResponse.json({ error: "Activa el webhook antes de reintentar" }, { status: 400 });

    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "PENDING", attempts: 0 } });
    await webhookDeliveryQueue.add("deliver", { deliveryId }, { jobId: `${deliveryId}-retry-${Date.now()}` });
    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
