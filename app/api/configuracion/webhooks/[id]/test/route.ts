import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { sendWebhookTestEvent } from "@/lib/webhooks/test-event";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere } from "@/lib/tenancy";
import { USERS_PATH } from "@/lib/billing/gates";

type Params = { params: Promise<{ id: string }> };

// "Enviar evento de prueba" (lib/webhooks/test-event.ts).
export async function POST(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const { allowed } = await rateLimit(`webhook-test:${admin.userId}`, 10, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas pruebas, espera un momento" }, { status: 429 });

    const { id } = await params;
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, ...(await orgWhere(admin.userId)) }, select: { id: true, active: true, userId: true } });
    if (!endpoint) return NextResponse.json({ error: "Webhook no encontrado" }, { status: 404 });
    const result = await sendWebhookTestEvent(endpoint);
    if (!result.ok) {
      if (result.reason === "not_in_plan") return NextResponse.json({ error: result.message, code: "plan_limit", limit: "webhooks", actionUrl: USERS_PATH }, { status: 402 });
      if (result.reason === "inactive") return NextResponse.json({ error: "Activa el webhook antes de probarlo" }, { status: 400 });
      return NextResponse.json({ error: "No se pudo crear la entrega" }, { status: 500 });
    }
    return NextResponse.json({ deliveryId: result.deliveryId }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
