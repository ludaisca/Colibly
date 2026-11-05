import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors, readJsonBody, methodNotAllowed } from "@/lib/api/respond";
import { createWebhook, serializeWebhook, webhookCreateSchema, WebhookAccessError, WebhookInputError, WebhookLimitError } from "@/lib/webhooks/crud";

// Los webhooks son del dueño de la key (no de la key): una integración que
// rota su key sigue viendo y administrando los mismos endpoints.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } });
  return apiOk({ data: endpoints.map(serializeWebhook) });
});

// POST — devuelve `secret` (whsec_...) una sola vez: guárdalo para verificar
// la firma X-Colibly-Signature de cada entrega.
export const POST = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  const body = await readJsonBody(req, webhookCreateSchema);
  try {
    const { endpoint, secret } = await createWebhook(ctx.userId, body);
    return apiOk({ ...serializeWebhook(endpoint), secret }, 201);
  } catch (err) {
    if (err instanceof WebhookAccessError) throw new ApiError(402, "plan_limit", err.message);
    if (err instanceof WebhookInputError) throw new ApiError(400, "invalid_request", err.message);
    if (err instanceof WebhookLimitError) throw new ApiError(409, "limit_reached", err.message);
    throw err;
  }
});

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = PUT;
export const DELETE = PUT;
