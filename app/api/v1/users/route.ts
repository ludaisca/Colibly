import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { serializeUser } from "@/lib/api/catalog";

// GET /api/v1/users — personas de la organización, para traducir
// `assignedToId` y para asignar con PATCH /conversations/{id}. Lista completa
// (no paginada), ordenada por nombre; incluye las desactivadas (`active: false`)
// porque pueden seguir apareciendo en conversaciones viejas.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  const rows = await prisma.user.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, name: true, email: true, role: true, disabledAt: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  return apiOk({ data: rows.map(serializeUser) });
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
