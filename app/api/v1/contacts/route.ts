import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, decodeCursor, encodeCursor, readPageParams, withApiErrors } from "@/lib/api/respond";
import { API_CONTACT_SELECT, contactScopeWhere, findScopedContact, serializeContact } from "@/lib/api/resources";
import { apiContactCreateSchema } from "@/lib/api/schemas";
import { setCustomFieldsByKey } from "@/lib/contacts/custom-fields";
import { afterContactTagAdded } from "@/lib/contacts/side-effects";
import { findOrCreateTag } from "@/lib/tags";
import { findContact, resolveContact } from "@/lib/contacts/resolve";
import { emitDomainEvent } from "@/lib/events/emit";
import { evaluatePlanLimit } from "@/lib/billing/gates";

// GET /api/v1/contacts — más recientes primero (updatedAt), paginado por cursor.
// Filtros: accountId, stageId (negocio abierto en esa etapa), tagId, q (nombre o teléfono), updatedSince.
export const GET = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "contacts:read");
  const url = new URL(req.url);
  const { limit, cursor } = readPageParams(url);
  const after = decodeCursor(cursor);

  const and: Prisma.ContactWhereInput[] = [contactScopeWhere(ctx)];
  const accountId = url.searchParams.get("accountId");
  if (accountId) and.push({ OR: [{ accountId }, { channelAccountId: accountId }] });
  const stageId = url.searchParams.get("stageId");
  if (stageId) {
    and.push({ person: { deals: { some: { stageId, status: "OPEN", archivedAt: null, organizationId: ctx.organizationId } } } });
  }
  const tagId = url.searchParams.get("tagId");
  if (tagId) and.push({ tags: { some: { tagId } } });
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { realName: { contains: q, mode: "insensitive" } },
        { remoteJid: { contains: q.replace(/\D/g, "") || q } },
      ],
    });
  }
  const updatedSince = url.searchParams.get("updatedSince");
  if (updatedSince) {
    const d = new Date(updatedSince);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, "invalid_request", "updatedSince debe ser una fecha ISO 8601");
    and.push({ updatedAt: { gte: d } });
  }
  if (after) {
    and.push({ OR: [{ updatedAt: { lt: after.t } }, { updatedAt: after.t, id: { lt: after.id } }] });
  }

  const rows = await prisma.contact.findMany({
    where: { AND: and },
    select: API_CONTACT_SELECT,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return apiOk({
    data: page.map(serializeContact),
    nextCursor: rows.length > limit && last ? encodeCursor({ t: last.updatedAt.toISOString(), id: last.id }) : null,
  });
});

// POST /api/v1/contacts — alta de un contacto de WhatsApp por teléfono. Es
// idempotente: si el teléfono ya existe en la cuenta responde 200 con el
// contacto existente (sin modificarlo); 201 si lo creó. Los contactos de
// Telegram/Messenger/Instagram/Web no se pueden crear así: su id lo asigna la
// plataforma cuando la persona escribe primero.
export const POST = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "contacts:write");
  const parsed = apiContactCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  const input = parsed.data;

  if (ctx.channelAccountIds.includes(input.accountId)) {
    throw new ApiError(400, "invalid_request", "Solo se pueden crear contactos en cuentas de WhatsApp");
  }
  if (!ctx.accountIds.includes(input.accountId)) {
    throw new ApiError(404, "not_found", "Cuenta no encontrada");
  }

  // Punto único de alta (lib/contacts/resolve.ts): el mismo móvil como 52… o
  // 521… cuenta como el mismo contacto.
  const scope = { kind: "whatsapp", accountId: input.accountId } as const;
  const existing = await findContact(scope, input.phone);
  if (existing) return apiOk(serializeContact(await findScopedContact(ctx, existing.id)), 200);

  const exceeded = await evaluatePlanLimit(ctx.organizationId, "contacts");
  if (exceeded) throw new ApiError(402, "plan_limit", exceeded.message);

  const resolved = await resolveContact(scope, {
    remoteJid: input.phone,
    name: input.name ?? input.phone,
    openDeal: { source: "api" },
  });
  const created = resolved.contact;
  // Carrera entre dos altas del mismo teléfono: la otra ganó.
  if (!resolved.created) return apiOk(serializeContact(await findScopedContact(ctx, created.id)), 200);

  if (input.customFields) {
    const { unknownKeys } = await setCustomFieldsByKey(created, input.customFields);
    if (unknownKeys.length > 0) {
      if (resolved.dealId) await prisma.deal.delete({ where: { id: resolved.dealId } }).catch(() => undefined);
      await prisma.contact.delete({ where: { id: created.id } });
      throw new ApiError(400, "invalid_request", `Campos personalizados desconocidos: ${unknownKeys.join(", ")}`);
    }
  }

  await emitDomainEvent({
    type: "contact.created",
    account: { kind: "whatsapp", id: input.accountId },
    chat: null,
    contactId: created.id,
    data: { origin: "ORGANIC", source: "api" },
  });

  for (const tagName of input.tags ?? []) {
    const tag = await findOrCreateTag(created, tagName);
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: created.id, tagId: tag.id } },
      create: { contactId: created.id, tagId: tag.id },
      update: {},
    });
    await afterContactTagAdded(created.id, tag);
  }

  return apiOk(serializeContact(await findScopedContact(ctx, created.id)), 201);
});
