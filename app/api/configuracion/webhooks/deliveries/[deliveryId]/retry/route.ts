import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REPLAY_ENDPOINT_SELECT, replayDelivery } from "@/lib/webhooks/replay";
import { requireAdmin } from "@/lib/integrations/admin-session";
import { publicErrorMessage } from "@/lib/api-errors";
import { orgWhere } from "@/lib/tenancy";
import { readOnlyResponse } from "@/lib/billing/gates";

type Params = { params: Promise<{ deliveryId: string }> };

// Reintento manual de una entrega FAILED (p. ej. tras arreglar el receptor);
// la lógica vive en lib/webhooks/replay.ts (compartida con la API).
export async function POST(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    const { deliveryId } = await params;
    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpoint: await orgWhere(admin.userId) },
      select: { id: true, status: true, endpoint: { select: REPLAY_ENDPOINT_SELECT } },
    });
    if (!delivery) return NextResponse.json({ error: "Entrega no encontrada" }, { status: 404 });
    const result = await replayDelivery(delivery);
    if (!result.ok) {
      // Licencia del dueño o solo lectura: sin esto, una cuenta que bajó de
      // plan seguiría mandando eventos a sus webhooks viejos con este botón.
      if (result.reason === "not_in_plan") {
        return NextResponse.json({ error: "Los webhooks requieren que su dueño sea admin con licencia Pro.", code: "plan_limit", limit: "webhooks" }, { status: 402 });
      }
      if (result.reason === "read_only") return readOnlyResponse();
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
