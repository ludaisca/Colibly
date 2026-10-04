import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { createWebhook, serializeWebhook, webhookCreateSchema, WebhookInputError } from "@/lib/webhooks/crud";

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
  const parsed = webhookCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  try {
    const { endpoint, secret } = await createWebhook(ctx.userId, parsed.data);
    return apiOk({ ...serializeWebhook(endpoint), secret }, 201);
  } catch (err) {
    if (err instanceof WebhookInputError) throw new ApiError(400, "invalid_request", err.message);
    throw err;
  }
});
