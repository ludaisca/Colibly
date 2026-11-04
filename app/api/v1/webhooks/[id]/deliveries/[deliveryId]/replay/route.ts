import { prisma } from "@/lib/prisma";
import { authenticateApiKey, enforceLimit } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { withIdempotency } from "@/lib/api/idempotency";
import { replayDelivery } from "@/lib/webhooks/replay";
import { API_WEBHOOK_REPLAYS_PER_MINUTE } from "@/lib/api/constants";

type Params = { params: Promise<{ id: string; deliveryId: string }> };

// POST /api/v1/webhooks/{id}/deliveries/{deliveryId}/replay — vuelve a
// entregar el MISMO evento (mismo cuerpo y mismo X-Colibly-Event-Id, intentos
// desde cero) a ese endpoint. Para entregas fallidas o ya entregadas (p. ej.
// el receptor perdió datos); una en curso responde 409.
export const POST = withIdempotency(withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  await enforceLimit(req, "endpoint", `api-webhook-replay:${ctx.organizationId}`, API_WEBHOOK_REPLAYS_PER_MINUTE, 60,
    `Límite de ${API_WEBHOOK_REPLAYS_PER_MINUTE} reenvíos por minuto para la organización excedido`);
  const { id, deliveryId } = await params;
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, endpointId: id, endpoint: { organizationId: ctx.organizationId } },
    select: { id: true, status: true, endpoint: { select: { active: true, disabledAt: true } } },
  });
  if (!delivery) throw new ApiError(404, "not_found", "Entrega no encontrada");
  const result = await replayDelivery(delivery, ["FAILED", "SENT"]);
  if (!result.ok) {
    if (result.reason === "endpoint_inactive") throw new ApiError(409, "conflict", "El webhook está desactivado: actívalo antes de reenviar");
    throw new ApiError(409, "conflict", "La entrega ya está en proceso");
  }
  return apiOk({ id: delivery.id, status: "pending" }, 202);
}));
