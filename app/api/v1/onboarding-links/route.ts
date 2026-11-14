import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, decodeCursor, encodeCursor, methodNotAllowed, readJsonBody, readPageParams, withApiErrors } from "@/lib/api/respond";
import { apiOnboardingLinkSchema } from "@/lib/api/schemas";
import { withIdempotency } from "@/lib/api/idempotency";
import { enforceWhatsAppAdminLimit } from "@/lib/api/whatsapp-admin";
import { createOnboardingLink, serializeOnboardingLink } from "@/lib/whatsapp/onboarding-links";

// GET /api/v1/onboarding-links — enlaces de conexión de la organización, más
// recientes primero.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const { limit, cursor } = readPageParams(new URL(req.url));
  const after = decodeCursor(cursor);
  const rows = await prisma.wAOnboardingLink.findMany({
    where: { organizationId: ctx.organizationId, ...(after ? { OR: [{ createdAt: { lt: after.t } }, { createdAt: after.t, id: { lt: after.id } }] } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({ data: page.map((l) => serializeOnboardingLink(l)), nextCursor: rows.length > limit && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null });
});

// POST /api/v1/onboarding-links — crea un enlace para que un cliente conecte
// su número de WhatsApp con su Facebook, sin cuenta en Colibly. `url` se
// devuelve solo aquí. El número entra a esta organización a nombre del dueño
// de la key; al terminar llega el evento account.connected.
export const POST = withIdempotency(withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiOnboardingLinkSchema, { optional: true });
  await enforceWhatsAppAdminLimit(req, ctx);
  const { link, url } = await createOnboardingLink({ organizationId: ctx.organizationId, userId: ctx.userId }, body ?? {});
  return apiOk({ ...serializeOnboardingLink(link), url }, 201);
}));

export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = PUT;
export const DELETE = PUT;
