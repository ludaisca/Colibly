import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { API_CALL_SELECT, serializeCall } from "@/lib/api/calls";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/calls/{id} — una llamada, con su transcripción si Meta la mandó.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  const { id } = await params;
  const call = ctx.accountIds.length ? await prisma.wACall.findFirst({ where: { id, accountId: { in: ctx.accountIds } }, select: API_CALL_SELECT }) : null;
  if (!call) throw new ApiError(404, "not_found", "Llamada no encontrada");
  return apiOk(serializeCall(call));
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
