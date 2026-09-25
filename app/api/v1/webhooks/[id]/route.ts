import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { serializeWebhook, updateWebhook, webhookUpdateSchema, WebhookInputError } from "@/lib/webhooks/crud";

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
  const parsed = webhookUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  try {
    const endpoint = await updateWebhook(ctx.userId, id, parsed.data);
    if (!endpoint) throw new ApiError(404, "not_found", "Webhook no encontrado");
    return apiOk(serializeWebhook(endpoint));
  } catch (err) {
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
