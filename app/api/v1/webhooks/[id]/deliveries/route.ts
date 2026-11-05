import type { WebhookDeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, decodeCursor, encodeCursor, readDateParam, readPageParams, withApiErrors, methodNotAllowed } from "@/lib/api/respond";
import { DELIVERY_PUBLIC_SELECT, serializeDelivery } from "@/lib/webhooks/replay";

type Params = { params: Promise<{ id: string }> };
const STATUSES = ["pending", "sent", "failed"] as const;

// GET /api/v1/webhooks/{id}/deliveries — historial de entregas del endpoint
// (las más recientes primero; se guardan 30 días). Filtros: status
// (pending | sent | failed), eventType, since. Sin el cuerpo: pídelo con
// GET …/deliveries/{deliveryId}.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  const { id } = await params;
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
  if (!endpoint) throw new ApiError(404, "not_found", "Webhook no encontrado");

  const url = new URL(req.url);
  const { limit, cursor } = readPageParams(url);
  const after = decodeCursor(cursor);
  const status = url.searchParams.get("status");
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(400, "invalid_request", `status debe ser uno de ${STATUSES.join(", ")}`);
  }
  const eventType = url.searchParams.get("eventType");
  const since = readDateParam(url, "since");

  const rows = await prisma.webhookDelivery.findMany({
    where: {
      endpointId: id,
      ...(status ? { status: status.toUpperCase() as WebhookDeliveryStatus } : {}),
      ...(eventType ? { eventType } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(after ? { OR: [{ createdAt: { lt: after.t } }, { createdAt: after.t, id: { lt: after.id } }] } : {}),
    },
    select: DELIVERY_PUBLIC_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({
    data: page.map(serializeDelivery),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null,
  });
});

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
