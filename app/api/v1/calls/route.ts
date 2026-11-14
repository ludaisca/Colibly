import type { Prisma, WACallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, decodeCursor, encodeCursor, methodNotAllowed, readDateParam, readPageParams, withApiErrors } from "@/lib/api/respond";
import { API_CALL_SELECT, serializeCall } from "@/lib/api/calls";

const STATUSES = ["RINGING", "CONNECTING", "ACTIVE", "ENDED", "MISSED", "REJECTED", "FAILED"] as const;

// GET /api/v1/calls — llamadas de WhatsApp de las cuentas de la key, más
// recientes primero, paginado por cursor. Filtros: accountId, contactId,
// status, direction (inbound|outbound), since.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  const url = new URL(req.url);
  const { limit, cursor } = readPageParams(url);
  const after = decodeCursor(cursor);

  const accountId = url.searchParams.get("accountId");
  const accountIds = accountId ? ctx.accountIds.filter((id) => id === accountId) : ctx.accountIds;
  const and: Prisma.WACallWhereInput[] = [{ accountId: { in: accountIds } }];
  const contactId = url.searchParams.get("contactId");
  if (contactId) and.push({ contactId });
  const status = url.searchParams.get("status")?.toUpperCase();
  if (status) {
    if (!(STATUSES as readonly string[]).includes(status)) throw new ApiError(400, "invalid_request", `status debe ser uno de ${STATUSES.join(", ")}`);
    and.push({ status: status as WACallStatus });
  }
  const direction = url.searchParams.get("direction");
  if (direction) {
    if (direction !== "inbound" && direction !== "outbound") throw new ApiError(400, "invalid_request", "direction debe ser inbound u outbound");
    and.push({ direction: direction === "inbound" ? "USER_INITIATED" : "BUSINESS_INITIATED" });
  }
  const since = readDateParam(url, "since");
  if (since) and.push({ createdAt: { gte: since } });
  if (after) and.push({ OR: [{ createdAt: { lt: after.t } }, { createdAt: after.t, id: { lt: after.id } }] });

  const rows = accountIds.length
    ? await prisma.wACall.findMany({ where: { AND: and }, select: API_CALL_SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 })
    : [];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({
    data: page.map(serializeCall),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null,
  });
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
