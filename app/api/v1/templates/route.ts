import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { serializeTemplate } from "@/lib/api/catalog";
import { refreshPendingTemplates } from "@/lib/whatsapp/template-sync";

// GET /api/v1/templates — plantillas de WhatsApp de las cuentas de la key, con
// lo que pide cada una para enviarse por POST /messages (type "template"):
// cuántos bodyParams, si lleva headerParam (y de qué formato) y si el botón
// URL pide buttonParam. Solo las APPROVED se pueden enviar. Lista completa
// (no paginada), ordenada por nombre. Filtros: accountId, status.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  // El estado es el de Meta (APPROVED, PENDING, REJECTED, PAUSED, DISABLED…).
  const status = url.searchParams.get("status")?.trim().toUpperCase() || null;
  const accountIds = accountId ? ctx.accountIds.filter((id) => id === accountId) : ctx.accountIds;
  const rows = await prisma.wATemplate.findMany({
    where: { waAccountId: { in: accountIds }, ...(status ? { status } : {}) },
    select: { id: true, waAccountId: true, name: true, language: true, category: true, status: true, statusReason: true, components: true, syncedAt: true },
    orderBy: [{ name: "asc" }, { language: "asc" }],
  });
  // Plantillas en revisión: refresca en segundo plano (≤ 1 vez por minuto por
  // cuenta) por si el webhook de Meta no llegó. POST /templates/sync lo hace al momento.
  if (rows.some((r) => r.status === "PENDING" || r.status === "IN_APPEAL")) after(() => refreshPendingTemplates(accountIds));
  return apiOk({ data: rows.map(serializeTemplate) });
});

export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
