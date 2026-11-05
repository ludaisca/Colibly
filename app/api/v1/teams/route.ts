import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { serializeTeam } from "@/lib/api/catalog";

// GET /api/v1/teams — equipos de la organización (Usuarios → Equipos), para
// traducir `teamId` y para mover conversaciones con PATCH /conversations/{id}.
// Lista completa (no paginada), por nombre; memberIds = personas activas.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  const rows = await prisma.team.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: { where: { user: { disabledAt: null } }, select: { userId: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return apiOk({ data: rows.map(serializeTeam) });
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
