import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { serializeOnboardingLink } from "@/lib/whatsapp/onboarding-links";

type Params = { params: Promise<{ id: string }> };

async function load(organizationId: string, id: string) {
  const link = await prisma.wAOnboardingLink.findFirst({ where: { id, organizationId } });
  if (!link) throw new ApiError(404, "not_found", "Enlace no encontrado");
  return link;
}

// GET /api/v1/onboarding-links/{id} — estado del enlace (PENDING, COMPLETED
// con accountId, CANCELED o EXPIRED) y el último error si el cliente lo intentó.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id } = await params;
  return apiOk(serializeOnboardingLink(await load(ctx.organizationId, id)));
});

// DELETE — cancela un enlace pendiente (deja de funcionar al instante).
export const DELETE = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { id } = await params;
  const link = await load(ctx.organizationId, id);
  if (link.status !== "PENDING") throw new ApiError(409, "conflict", `El enlace ya está ${link.status === "COMPLETED" ? "usado" : "cancelado"}`);
  const updated = await prisma.wAOnboardingLink.update({ where: { id: link.id }, data: { status: "CANCELED" } });
  return apiOk(serializeOnboardingLink(updated));
});

export const POST = methodNotAllowed("GET", "DELETE");
export const PUT = POST;
export const PATCH = POST;
