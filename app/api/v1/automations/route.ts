import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { serializeAutomation } from "@/lib/api/catalog";

// GET /api/v1/automations — automatizaciones de las cuentas de la key (sin
// archivadas). `runnable: true` = activa con disparador "manual": la que acepta
// POST /automations/{id}/runs. Lista completa (no paginada), por nombre.
// Filtros: accountId, runnable=true.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "automations:run");
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  const onlyRunnable = url.searchParams.get("runnable") === "true";
  const wa = accountId ? ctx.accountIds.filter((id) => id === accountId) : ctx.accountIds;
  const channels = accountId ? ctx.channelAccountIds.filter((id) => id === accountId) : ctx.channelAccountIds;
  const rows = await prisma.automation.findMany({
    where: {
      organizationId: ctx.organizationId,
      OR: [{ waAccountId: { in: wa } }, { channelAccountId: { in: channels } }],
      ...(onlyRunnable ? { status: "ACTIVE" as const, triggerType: "manual" } : { status: { not: "ARCHIVED" as const } }),
    },
    select: { id: true, waAccountId: true, channelAccountId: true, name: true, description: true, status: true, triggerType: true, updatedAt: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return apiOk({ data: rows.map(serializeAutomation) });
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
