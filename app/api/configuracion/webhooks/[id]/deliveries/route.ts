import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { publicErrorMessage } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

// Últimas 50 entregas del endpoint (el registro se purga a los 30 días).
export async function GET(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await params;
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, userId: admin.userId }, select: { id: true } });
    if (!endpoint) return NextResponse.json({ error: "Webhook no encontrado" }, { status: 404 });

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { endpointId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        eventType: true,
        status: true,
        attempts: true,
        responseCode: true,
        error: true,
        createdAt: true,
        deliveredAt: true,
        payload: true,
      },
    });
    return NextResponse.json(deliveries);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
