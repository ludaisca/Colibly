import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, decodeCursor, encodeCursor, readPageParams, withApiErrors } from "@/lib/api/respond";
import { apiActor, crmCall, dealScopeWhere, serializeApiDeal } from "@/lib/api/deals";
import { findScopedContact } from "@/lib/api/resources";
import { createDeal, dealSelect } from "@/lib/crm/deals";

// GET /api/v1/deals — más recientes primero (updatedAt), paginado por cursor.
// Filtros: pipelineId, stageId, status (OPEN|WON|LOST), contactId, updatedSince.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "deals:read");
  const url = new URL(req.url);
  const { limit, cursor } = readPageParams(url);
  const after = decodeCursor(cursor);

  const and: Prisma.DealWhereInput[] = [dealScopeWhere(ctx), { archivedAt: null }];
  const pipelineId = url.searchParams.get("pipelineId");
  if (pipelineId) and.push({ pipelineId });
  const stageId = url.searchParams.get("stageId");
  if (stageId) and.push({ stageId });
  const status = url.searchParams.get("status");
  if (status) {
    if (!["OPEN", "WON", "LOST"].includes(status)) throw new ApiError(400, "invalid_request", "status debe ser OPEN, WON o LOST");
    and.push({ status: status as "OPEN" | "WON" | "LOST" });
  }
  const contactId = url.searchParams.get("contactId");
  if (contactId) and.push({ contactId });
  const updatedSince = url.searchParams.get("updatedSince");
  if (updatedSince) {
    const d = new Date(updatedSince);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, "invalid_request", "updatedSince debe ser una fecha ISO 8601");
    and.push({ updatedAt: { gte: d } });
  }
  if (after) and.push({ OR: [{ updatedAt: { lt: after.t } }, { updatedAt: after.t, id: { lt: after.id } }] });

  const rows = await prisma.deal.findMany({
    where: { AND: and },
    select: dealSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({
    data: page.map(serializeApiDeal),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.updatedAt.toISOString(), id: last.id }) : null,
  });
});

const bodySchema = z.object({
  // El contacto (canal) del que sale el negocio: de ahí se toma la persona y
  // queda ligada la conversación.
  contactId: z.string().min(1, "contactId es requerido"),
  title: z.string().trim().max(200).optional(),
  amount: z.number().min(0).optional(),
  pipelineId: z.string().min(1).optional(),
  stageId: z.string().min(1).optional(),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  expectedCloseDate: z.string().optional(),
});

// POST /api/v1/deals — abre un negocio para un contacto. Sin stageId/pipelineId
// entra a la primera etapa del pipeline predeterminado.
export const POST = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "deals:write");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  const contact = await findScopedContact(ctx, parsed.data.contactId);
  const created = await crmCall(() =>
    createDeal(apiActor(ctx), { ...parsed.data, contactId: contact.id, personId: contact.personId, source: "api" })
  );
  return apiOk(created, 201);
});
