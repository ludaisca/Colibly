import { prisma } from "@/lib/prisma";
import { authenticateApiKey, enforceLimit } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { sendWebhookTestEvent } from "@/lib/webhooks/test-event";
import { API_WEBHOOK_TESTS_PER_MINUTE } from "@/lib/api/constants";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/webhooks/{id}/test — manda un evento `webhook.test` firmado a
// ese endpoint, como una entrega real (reintentos e historial incluidos). Para
// validar la URL y la verificación de firma sin esperar un evento real.
// Responde 202 con el id de la entrega: su resultado se lee en
// GET /webhooks/{id}/deliveries/{deliveryId}.
export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  await enforceLimit(req, "endpoint", `api-webhook-test:${ctx.organizationId}`, API_WEBHOOK_TESTS_PER_MINUTE, 60,
    `Límite de ${API_WEBHOOK_TESTS_PER_MINUTE} pruebas por minuto para la organización excedido`);
  const { id } = await params;
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, active: true, userId: true } });
  if (!endpoint) throw new ApiError(404, "not_found", "Webhook no encontrado");
  const result = await sendWebhookTestEvent(endpoint);
  if (!result.ok) {
    if (result.reason === "not_in_plan") throw new ApiError(402, "plan_limit", result.message);
    if (result.reason === "inactive") throw new ApiError(409, "conflict", "El webhook está desactivado: actívalo antes de probarlo");
    throw new Error("No se pudo crear la entrega de prueba");
  }
  return apiOk({ deliveryId: result.deliveryId, status: "pending" }, 202);
});

export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
