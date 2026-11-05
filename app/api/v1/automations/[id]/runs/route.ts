import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors, readJsonBody, methodNotAllowed } from "@/lib/api/respond";
import { findScopedContact } from "@/lib/api/resources";
import { startRun } from "@/lib/automations/runner";
import { withIdempotency } from "@/lib/api/idempotency";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  contactId: z.string().min(1),
  vars: z.record(z.string().max(64), z.string().max(1000)).optional(),
});

// POST /api/v1/automations/{id}/runs — inicia una automatización con
// disparador "Manual" para un contacto (p. ej. tu ERP al confirmar un pedido).
export const POST = withIdempotency(withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "automations:run");
  const { id } = await params;
  const body = await readJsonBody(req, bodySchema);

  const contact = await findScopedContact(ctx, body.contactId);
  const automation = await prisma.automation.findFirst({
    where: {
      id,
      status: "ACTIVE",
      triggerType: "manual",
      OR: [{ waAccountId: { in: ctx.accountIds } }, { channelAccountId: { in: ctx.channelAccountIds } }],
    },
    select: { id: true, waAccountId: true, channelAccountId: true, channelAccount: { select: { channel: true } } },
  });
  if (!automation) throw new ApiError(404, "not_found", "Automatización manual activa no encontrada");
  if ((automation.waAccountId ?? automation.channelAccountId) !== (contact.accountId ?? contact.channelAccountId)) {
    throw new ApiError(400, "invalid_request", "El contacto es de otra cuenta que la automatización");
  }
  const chatId = contact.chat?.id ?? contact.conversation?.id ?? null;

  const result = await startRun({
    automationId: automation.id,
    contactId: contact.id,
    account: automation.waAccountId
      ? { kind: "whatsapp", id: automation.waAccountId }
      : { kind: "channel", id: automation.channelAccountId!, channel: automation.channelAccount!.channel },
    chat: chatId ? (contact.accountId ? { kind: "whatsapp", id: chatId } : { kind: "channel", id: chatId }) : null,
    vars: body.vars,
    force: true,
  });
  if (!result.started) throw new ApiError(409, "conflict", result.reason);
  return apiOk({ runId: result.runId }, 201);
}));

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
