import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { webhookDeliveryQueue } from "@/lib/queue";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { createDelivery } from "@/lib/webhooks/fanout";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere, requireOrgId } from "@/lib/tenancy";
import { checkWebhookAccess } from "@/lib/billing/gates";
import { BRAND_NAME } from "@/lib/brand";

type Params = { params: Promise<{ id: string }> };

// "Enviar evento de prueba": una entrega real (firmada, con reintentos y
// registro) de un evento webhook.test, para validar la URL y la verificación
// de firma del receptor sin esperar a que ocurra un evento real.
export async function POST(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    // Las entregas son del plan Pro: sin esto, una cuenta que bajó a Esencial o Negocio
    // seguiría mandando eventos a sus webhooks viejos con este botón.
    const noHooks = await checkWebhookAccess(await requireOrgId(admin.userId));
    if (noHooks) return noHooks;
    const { allowed } = await rateLimit(`webhook-test:${admin.userId}`, 10, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas pruebas, espera un momento" }, { status: 429 });

    const { id } = await params;
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, ...(await orgWhere(admin.userId)) }, select: { id: true, active: true } });
    if (!endpoint) return NextResponse.json({ error: "Webhook no encontrado" }, { status: 404 });
    if (!endpoint.active) return NextResponse.json({ error: "Activa el webhook antes de probarlo" }, { status: 400 });

    const delivery = await createDelivery(endpoint.id, {
      id: randomUUID(),
      type: "webhook.test",
      occurredAt: new Date().toISOString(),
      account: null,
      contact: null,
      conversation: null,
      data: { message: `Evento de prueba enviado desde ${BRAND_NAME}` },
    });
    if (!delivery) return NextResponse.json({ error: "No se pudo crear la entrega" }, { status: 500 });
    await webhookDeliveryQueue.add("deliver", { deliveryId: delivery.id }, { jobId: delivery.id });
    return NextResponse.json({ deliveryId: delivery.id }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
