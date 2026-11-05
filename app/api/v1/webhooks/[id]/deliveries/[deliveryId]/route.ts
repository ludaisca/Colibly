import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors, methodNotAllowed } from "@/lib/api/respond";
import { DELIVERY_PUBLIC_SELECT, serializeDelivery } from "@/lib/webhooks/replay";

type Params = { params: Promise<{ id: string; deliveryId: string }> };

// GET /api/v1/webhooks/{id}/deliveries/{deliveryId} — una entrega con el
// cuerpo exacto que se envió (`payload`, lo mismo que firma X-Colibly-Signature).
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  const { id, deliveryId } = await params;
  const d = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, endpointId: id, endpoint: { organizationId: ctx.organizationId } },
    select: { ...DELIVERY_PUBLIC_SELECT, payload: true },
  });
  if (!d) throw new ApiError(404, "not_found", "Entrega no encontrada");
  return apiOk({ ...serializeDelivery(d), payload: d.payload });
});

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
