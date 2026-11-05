import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { rotateWebhookSecret, WEBHOOK_ROTATION_MAX_GRACE_HOURS } from "@/lib/webhooks/crud";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    graceHours: z
      .number()
      .int("graceHours debe ser un entero")
      .min(0, "graceHours no puede ser negativo")
      .max(WEBHOOK_ROTATION_MAX_GRACE_HOURS, `graceHours máximo ${WEBHOOK_ROTATION_MAX_GRACE_HOURS}`)
      .optional(),
  })
  .strict();

// POST /api/v1/webhooks/{id}/rotate-secret — genera un secreto nuevo y lo
// devuelve (única vez que se ve). Sin cuerpo o con graceHours 0, el anterior
// deja de firmar de inmediato. Con graceHours (1-72) el anterior sigue
// firmando ese tiempo como segunda v1 del header (`t=…,v1=<nuevo>,v1=<anterior>`),
// para cambiar el receptor sin perder entregas.
export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "webhooks:manage");
  const { id } = await params;
  const { graceHours = 0 } = await readJsonBody(req, bodySchema, { optional: true });
  const rotated = await rotateWebhookSecret(ctx.userId, id, graceHours);
  if (!rotated) throw new ApiError(404, "not_found", "Webhook no encontrado");
  return apiOk({ id, secret: rotated.secret, previousSecretExpiresAt: rotated.previousSecretExpiresAt });
});

export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
