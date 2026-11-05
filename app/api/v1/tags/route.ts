import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { serializeTag } from "@/lib/api/catalog";

// GET /api/v1/tags — etiquetas de contacto de las cuentas de la key (son por
// cuenta). Sirve para filtrar /contacts?tagId= y para POST /contacts/{id}/tags.
// Lista completa (no paginada), ordenada por nombre. Filtro: accountId.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "contacts:read");
  const accountId = new URL(req.url).searchParams.get("accountId");
  const wa = accountId ? ctx.accountIds.filter((id) => id === accountId) : ctx.accountIds;
  const channels = accountId ? ctx.channelAccountIds.filter((id) => id === accountId) : ctx.channelAccountIds;
  const rows = await prisma.tag.findMany({
    where: { OR: [{ waAccountId: { in: wa } }, { channelAccountId: { in: channels } }] },
    select: { id: true, name: true, color: true, waAccountId: true, channelAccountId: true, createdAt: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return apiOk({ data: rows.map(serializeTag) });
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
