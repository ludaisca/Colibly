import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors, readJsonBody, methodNotAllowed } from "@/lib/api/respond";
import { serializeWebhook, updateWebhook, webhookUpdateSchema, WebhookAccessError, WebhookInputError } from "@/lib/webhooks/crud";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  const { id } = await params;
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!endpoint) throw new ApiError(404, "not_found", "Webhook no encontrado");
  return apiOk(serializeWebhook(endpoint));
});

export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  const { id } = await params;
  const body = await readJsonBody(req, webhookUpdateSchema);
  try {
    const endpoint = await updateWebhook(ctx.userId, id, body);
    if (!endpoint) throw new ApiError(404, "not_found", "Webhook no encontrado");
    return apiOk(serializeWebhook(endpoint));
  } catch (err) {
    if (err instanceof WebhookAccessError) throw new ApiError(402, "plan_limit", err.message);
    if (err instanceof WebhookInputError) throw new ApiError(400, "invalid_request", err.message);
    throw err;
  }
});

export const DELETE = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  const { id } = await params;
  const { count } = await prisma.webhookEndpoint.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (count === 0) throw new ApiError(404, "not_found", "Webhook no encontrado");
  return apiOk({ deleted: true });
});

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const POST = methodNotAllowed("GET", "PATCH", "DELETE");
export const PUT = POST;
