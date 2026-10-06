import { Prisma, type DealStatus, type LeadOrigin } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CrmError, forbidden, invalid, notFound, versionConflict } from "@/lib/crm/errors";
import { isRestricted, requireRoles, type CrmActor } from "@/lib/crm/access";
import { logActivity } from "@/lib/crm/activity";
import { validateOwner, validateCompany } from "@/lib/crm/people";
import { ensureDefaultPipeline } from "@/lib/crm/pipelines";
import { emitTaskEvent } from "@/lib/crm/task-events";
import { createStageTask } from "@/lib/crm/stage-tasks";
import { afterDealCreated, afterDealStageChanged } from "@/lib/crm/deal-effects";
import { defaultDealTitle, effectiveProbability, planTransition, roundMoney, weightedAmount } from "@/lib/crm/deal-rules";
import { diffFields } from "@/lib/crm/merge-fields";

// Servicio de NEGOCIOS (`Deal`). El alcance es siempre `organizationId`; el
// ejecutivo (rol acotado) solo ve y edita los negocios de los que es
// responsable. Mover un negocio de etapa es el único camino para cerrarlo
// (ganado/perdido) y dispara los efectos de `deal-effects.ts` (Conversions API,
// secuencias, eventos de dominio).

export const dealSelect = {
  id: true,
  title: true,
  amount: true,
  probability: true,
  expectedCloseDate: true,
  status: true,
  stageId: true,
  pipelineId: true,
  stageEnteredAt: true,
  closedAt: true,
  lostReasonId: true,
  lossNote: true,
  personId: true,
  companyId: true,
  contactId: true,
  ownerId: true,
  leadOrigin: true,
  adId: true,
  source: true,
  version: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  stage: { select: { id: true, name: true, color: true, outcome: true, probability: true } },
  person: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  lostReason: { select: { id: true, name: true } },
} satisfies Prisma.DealSelect;

type DealRow = Prisma.DealGetPayload<{ select: typeof dealSelect }>;

export function serializeDeal(row: DealRow) {
  const amount = Number(row.amount);
  const probability = effectiveProbability(row, row.stage);
  return {
    ...row,
    amount,
    probabilityEffective: probability,
    weightedAmount: weightedAmount(amount, probability),
  };
}

// ── Acceso ──────────────────────────────────────────────────────────────────

// El ejecutivo solo trabaja con los negocios que tiene asignados.
function assertCanSeeDeal(actor: CrmActor, deal: { ownerId: string | null }): void {
  if (isRestricted(actor) && deal.ownerId !== actor.userId) throw notFound("Negocio");
}

function assertCanEditDeal(actor: CrmActor, deal: { ownerId: string | null }): void {
  if (isRestricted(actor) && deal.ownerId !== actor.userId) throw forbidden("Solo puedes editar los negocios que tienes asignados");
}

async function loadDeal(actor: CrmActor, id: string) {
  const deal = await prisma.deal.findFirst({ where: { id, organizationId: actor.organizationId }, select: dealSelect });
  if (!deal) throw notFound("Negocio");
  assertCanSeeDeal(actor, deal);
  return deal;
}

// Etapa de un pipeline de la organización (y del que no está archivado).
async function loadStage(organizationId: string, stageId: string) {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipeline: { organizationId } },
    select: { id: true, name: true, outcome: true, probability: true, pipelineId: true, pipeline: { select: { archivedAt: true } } },
  });
  if (!stage) throw notFound("Etapa");
  if (stage.pipeline.archivedAt) throw invalid("Ese pipeline está archivado");
  return stage;
}

async function validateLossReason(organizationId: string, id: string): Promise<void> {
  const ok = await prisma.lossReason.findFirst({ where: { id, organizationId, archivedAt: null }, select: { id: true } });
  if (!ok) throw invalid("El motivo de pérdida no existe");
}

// ── Esquemas ────────────────────────────────────────────────────────────────

const money = z.number().min(0, "El importe no puede ser negativo").max(999_999_999_999, "Importe demasiado grande");
const percent = z.number().int().min(0).max(100);
const closeDate = z
  .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")])
  .nullable()
  .optional();
const toDate = (v: string | null | undefined) => (v ? new Date(v.length === 10 ? `${v}T12:00:00Z` : v) : v === null ? null : undefined);

const dealCreateSchema = z.object({
  personId: z.string().min(1, "Falta el contacto"),
  title: z.string().trim().max(200).optional(),
  amount: money.optional(),
  pipelineId: z.string().min(1).optional(),
  stageId: z.string().min(1).optional(),
  companyId: z.string().min(1).nullable().optional(),
  contactId: z.string().min(1).nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  probability: percent.nullable().optional(),
  expectedCloseDate: closeDate,
  source: z.string().trim().max(40).optional(),
});

const dealUpdateSchema = z.object({
  expectedVersion: z.number().int().positive("Falta la versión del registro"),
  title: z.string().trim().min(1, "Indica el título").max(200).optional(),
  amount: money.optional(),
  probability: percent.nullable().optional(),
  expectedCloseDate: closeDate,
  companyId: z.string().min(1).nullable().optional(),
  contactId: z.string().min(1).nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  archived: z.boolean().optional(),
});

const dealMoveSchema = z.object({
  stageId: z.string().min(1, "Falta la etapa"),
  expectedVersion: z.number().int().positive().optional(),
  lostReasonId: z.string().min(1).nullable().optional(),
  lostNote: z.string().max(500).nullable().optional(),
});

export const dealFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  status: z.enum(["OPEN", "WON", "LOST"]).optional(),
  ownerId: z.string().optional(), // id | "none" | "me"
  personId: z.string().optional(),
  companyId: z.string().optional(),
  leadOrigin: z.enum(["ORGANIC", "INSTANT_FORM", "CTWA"]).optional(),
  adId: z.string().optional(),
  archived: z.enum(["exclude", "only", "include"]).optional(),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
  closedFrom: z.string().datetime({ offset: true }).optional(),
  closedTo: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(["recent", "newest", "amount", "closing"]).optional(),
});
export type DealFilters = z.infer<typeof dealFiltersSchema>;

// ── Alta ────────────────────────────────────────────────────────────────────

export async function createDeal(actor: CrmActor, raw: unknown) {
  const input = dealCreateSchema.parse(raw);
  const person = await prisma.person.findFirst({
    where: { id: input.personId, organizationId: actor.organizationId },
    select: { id: true, name: true, ownerId: true, companyId: true, archivedAt: true },
  });
  if (!person) throw notFound("Contacto");
  if (person.archivedAt) throw invalid("El contacto está archivado");
  // El ejecutivo abre negocios solo de contactos que tiene asignados.
  if (isRestricted(actor) && person.ownerId !== actor.userId) throw forbidden("Solo puedes crear negocios de los contactos que tienes asignados");

  // Etapa de entrada: la indicada, la primera del pipeline indicado o la del
  // pipeline predeterminado. Un negocio nuevo siempre entra a una etapa abierta.
  let stage;
  if (input.stageId) {
    stage = await loadStage(actor.organizationId, input.stageId);
    if (input.pipelineId && input.pipelineId !== stage.pipelineId) throw invalid("La etapa no pertenece a ese pipeline");
  } else if (input.pipelineId) {
    const first = await prisma.pipelineStage.findFirst({ where: { pipelineId: input.pipelineId, pipeline: { organizationId: actor.organizationId } }, orderBy: { position: "asc" }, select: { id: true } });
    if (!first) throw notFound("Pipeline");
    stage = await loadStage(actor.organizationId, first.id);
  } else {
    stage = await loadStage(actor.organizationId, (await ensureDefaultPipeline(actor.organizationId)).firstStageId);
  }
  if (stage.outcome !== "OPEN") throw invalid("Un negocio nuevo debe empezar en una etapa abierta; ciérralo moviéndolo después");

  // Conversación a la que queda ligado: la indicada (de este contacto) o la
  // identidad de canal con actividad más reciente.
  const contact = input.contactId
    ? await prisma.contact.findFirst({ where: { id: input.contactId, personId: person.id }, select: { id: true, leadOrigin: true, adId: true } })
    : await prisma.contact.findFirst({ where: { personId: person.id }, orderBy: { updatedAt: "desc" }, select: { id: true, leadOrigin: true, adId: true } });
  if (input.contactId && !contact) throw invalid("Ese canal no pertenece al contacto");

  const companyId = input.companyId === undefined ? person.companyId : input.companyId;
  if (companyId) await validateCompany(actor.organizationId, companyId);
  let ownerId: string | null;
  if (isRestricted(actor)) ownerId = actor.userId;
  else {
    ownerId = input.ownerId === undefined ? person.ownerId ?? actor.userId : input.ownerId;
    if (ownerId) await validateOwner(actor.organizationId, ownerId);
  }

  let stageTaskId: string | null = null;
  const deal = await prisma.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        organizationId: actor.organizationId,
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        personId: person.id,
        companyId,
        contactId: contact?.id ?? null,
        title: input.title?.trim() || defaultDealTitle(person.name),
        amount: new Prisma.Decimal(roundMoney(input.amount ?? 0)),
        probability: input.probability ?? null,
        expectedCloseDate: toDate(input.expectedCloseDate) ?? null,
        ownerId,
        createdById: actor.userId,
        leadOrigin: (contact?.leadOrigin ?? "ORGANIC") as LeadOrigin,
        adId: contact?.adId ?? null,
        source: input.source ?? "manual",
      },
      select: { id: true },
    });
    await tx.dealStageChange.create({
      data: { organizationId: actor.organizationId, dealId: created.id, toStageId: stage.id, toStageName: stage.name, toStatus: stage.outcome, actorId: actor.userId },
    });
    await logActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      type: "deal.created",
      personId: person.id,
      data: { dealId: created.id, stage: stage.name },
    });
    stageTaskId = await createStageTask(tx, {
      organizationId: actor.organizationId,
      dealId: created.id,
      personId: person.id,
      dealTitle: input.title?.trim() || defaultDealTitle(person.name),
      ownerId,
      stageId: stage.id,
      enteredAt: new Date(),
      actorId: actor.userId,
    });
    return tx.deal.findUniqueOrThrow({ where: { id: created.id }, select: dealSelect });
  });

  void afterDealCreated(deal.id);
  if (stageTaskId) void emitTaskEvent("task.created", stageTaskId);
  return serializeDeal(deal);
}

// ── Edición ─────────────────────────────────────────────────────────────────

export async function updateDeal(actor: CrmActor, id: string, raw: unknown) {
  const input = dealUpdateSchema.parse(raw);
  const deal = await loadDeal(actor, id);
  assertCanEditDeal(actor, deal);

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.amount !== undefined) patch.amount = roundMoney(input.amount);
  if (input.probability !== undefined) patch.probability = input.probability;
  if (input.expectedCloseDate !== undefined) patch.expectedCloseDate = toDate(input.expectedCloseDate);
  if (input.companyId !== undefined) {
    if (input.companyId) await validateCompany(actor.organizationId, input.companyId);
    patch.companyId = input.companyId;
  }
  if (input.contactId !== undefined) {
    if (input.contactId) {
      const ok = await prisma.contact.findFirst({ where: { id: input.contactId, personId: deal.personId }, select: { id: true } });
      if (!ok) throw invalid("Ese canal no pertenece al contacto");
    }
    patch.contactId = input.contactId;
  }

  const data: Prisma.DealUncheckedUpdateManyInput = {};
  Object.assign(data, patch);
  if (patch.amount !== undefined) data.amount = new Prisma.Decimal(patch.amount as number);

  const ownerChanged = input.ownerId !== undefined && input.ownerId !== deal.ownerId;
  if (ownerChanged) {
    requireRoles(actor, ["admin", "user"]);
    if (input.ownerId) await validateOwner(actor.organizationId, input.ownerId);
    data.ownerId = input.ownerId;
  }
  const archiveChanged = input.archived !== undefined && input.archived !== !!deal.archivedAt;
  if (archiveChanged) {
    requireRoles(actor, ["admin", "user"]);
    data.archivedAt = input.archived ? new Date() : null;
  }

  const before: Record<string, unknown> = { ...deal, amount: Number(deal.amount), expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null };
  const after: Record<string, unknown> = { ...patch, ...(patch.expectedCloseDate !== undefined ? { expectedCloseDate: (patch.expectedCloseDate as Date | null)?.toISOString() ?? null } : {}) };
  const changes = diffFields(before, after, ["title", "amount", "probability", "expectedCloseDate", "companyId", "contactId"]);
  if (!Object.keys(changes).length && !ownerChanged && !archiveChanged) return serializeDeal(deal);

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.deal.updateMany({
      where: { id, organizationId: actor.organizationId, version: input.expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (res.count === 0) throw versionConflict(serializeDeal(await tx.deal.findUniqueOrThrow({ where: { id }, select: dealSelect })));
    const base = { organizationId: actor.organizationId, actorId: actor.userId, personId: deal.personId };
    if (Object.keys(changes).length) await logActivity(tx, { ...base, type: "deal.updated", data: { dealId: id, changes } as Prisma.InputJsonValue });
    if (ownerChanged) await logActivity(tx, { ...base, type: "deal.owner_changed", data: { dealId: id, from: deal.ownerId, to: input.ownerId ?? null } });
    if (archiveChanged) await logActivity(tx, { ...base, type: input.archived ? "deal.archived" : "deal.restored", data: { dealId: id } });
    return tx.deal.findUniqueOrThrow({ where: { id }, select: dealSelect });
  });
  return serializeDeal(updated);
}

// ── Mover de etapa (y cerrar) ───────────────────────────────────────────────

export async function moveDeal(actor: CrmActor, id: string, raw: unknown) {
  const input = dealMoveSchema.parse(raw);
  const deal = await loadDeal(actor, id);
  assertCanEditDeal(actor, deal);
  if (deal.archivedAt) throw invalid("El negocio está archivado: restáuralo para moverlo");
  const to = await loadStage(actor.organizationId, input.stageId);

  const now = new Date();
  const plan = planTransition(deal, to, now, { lostReasonId: input.lostReasonId, lossNote: input.lostNote });
  if (!plan.changed) return serializeDeal(deal);
  if (plan.lostReasonId) await validateLossReason(actor.organizationId, plan.lostReasonId);
  const expected = input.expectedVersion ?? deal.version;

  let stageTaskId: string | null = null;
  const { updated, from } = await prisma.$transaction(async (tx) => {
    const res = await tx.deal.updateMany({
      where: { id, organizationId: actor.organizationId, version: expected },
      data: {
        stageId: to.id,
        pipelineId: to.pipelineId,
        status: plan.status,
        stageEnteredAt: now,
        closedAt: plan.closedAt,
        lostReasonId: plan.lostReasonId,
        lossNote: plan.lossNote,
        version: { increment: 1 },
      },
    });
    if (res.count === 0) throw versionConflict(serializeDeal(await tx.deal.findUniqueOrThrow({ where: { id }, select: dealSelect })));

    await tx.dealStageChange.create({
      data: {
        organizationId: actor.organizationId,
        dealId: id,
        fromStageId: deal.stage.id,
        fromStageName: deal.stage.name,
        toStageId: to.id,
        toStageName: to.name,
        toStatus: plan.status,
        actorId: actor.userId,
        secondsInFrom: plan.secondsInFrom,
      },
    });
    await logActivity(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      type: "deal.stage_changed",
      personId: deal.personId,
      data: { dealId: id, title: deal.title, from: deal.stage.name, to: to.name, status: plan.status, ...(plan.lostReasonId ? { lostReasonId: plan.lostReasonId } : {}) },
    });
    // Ganar un negocio convierte al contacto en cliente.
    if (plan.status === "WON") {
      const flipped = await tx.person.updateMany({ where: { id: deal.personId, lifecycle: "LEAD" }, data: { lifecycle: "CUSTOMER", version: { increment: 1 } } });
      if (flipped.count) {
        await logActivity(tx, {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          type: "person.updated",
          personId: deal.personId,
          data: { changes: { lifecycle: ["LEAD", "CUSTOMER"] }, reason: "deal_won", dealId: id },
        });
      }
    }
    // Regla de la etapa: tarea de seguimiento al entrar (p. ej. postventa al ganar).
    stageTaskId = await createStageTask(tx, {
      organizationId: actor.organizationId,
      dealId: id,
      personId: deal.personId,
      dealTitle: deal.title,
      ownerId: deal.ownerId,
      stageId: to.id,
      enteredAt: now,
      actorId: actor.userId,
    });
    return { updated: await tx.deal.findUniqueOrThrow({ where: { id }, select: dealSelect }), from: { id: deal.stage.id, name: deal.stage.name } };
  });

  void afterDealStageChanged(updated.id, from);
  if (stageTaskId) void emitTaskEvent("task.created", stageTaskId);
  return serializeDeal(updated);
}

// Borrado definitivo (solo admin): para limpiar altas por error. Lo normal es
// perder el negocio o archivarlo, que conservan el historial.
export async function deleteDeal(actor: CrmActor, id: string) {
  requireRoles(actor, ["admin"]);
  const deal = await loadDeal(actor, id);
  await prisma.$transaction(async (tx) => {
    await tx.deal.delete({ where: { id } });
    await logActivity(tx, { organizationId: actor.organizationId, actorId: actor.userId, type: "deal.deleted", personId: deal.personId, data: { dealId: id, title: deal.title } });
  });
  return { ok: true };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export async function buildDealWhere(actor: CrmActor, f: DealFilters): Promise<Prisma.DealWhereInput> {
  const and: Prisma.DealWhereInput[] = [{ organizationId: actor.organizationId }];
  if (f.archived === "only") and.push({ archivedAt: { not: null } });
  else if (f.archived !== "include") and.push({ archivedAt: null });
  // El ejecutivo ve solo lo suyo, pida lo que pida.
  if (isRestricted(actor)) and.push({ ownerId: actor.userId });
  else if (f.ownerId === "none") and.push({ ownerId: null });
  else if (f.ownerId === "me") and.push({ ownerId: actor.userId });
  else if (f.ownerId) and.push({ ownerId: f.ownerId });
  if (f.pipelineId) and.push({ pipelineId: f.pipelineId });
  if (f.stageId) and.push({ stageId: f.stageId });
  if (f.status) and.push({ status: f.status });
  if (f.personId) and.push({ personId: f.personId });
  if (f.companyId) and.push({ companyId: f.companyId });
  if (f.leadOrigin) and.push({ leadOrigin: f.leadOrigin });
  if (f.adId) and.push({ adId: f.adId });
  if (f.createdFrom) and.push({ createdAt: { gte: new Date(f.createdFrom) } });
  if (f.createdTo) and.push({ createdAt: { lte: new Date(f.createdTo) } });
  if (f.closedFrom) and.push({ closedAt: { gte: new Date(f.closedFrom) } });
  if (f.closedTo) and.push({ closedAt: { lte: new Date(f.closedTo) } });
  if (f.q) {
    and.push({ OR: [{ title: { contains: f.q, mode: "insensitive" } }, { person: { name: { contains: f.q, mode: "insensitive" } } }, { company: { name: { contains: f.q, mode: "insensitive" } } }] });
  }
  return { AND: and };
}

const orderFor = (sort: DealFilters["sort"]): Prisma.DealOrderByWithRelationInput[] =>
  sort === "amount"
    ? [{ amount: "desc" }, { id: "desc" }]
    : sort === "newest"
      ? [{ createdAt: "desc" }, { id: "desc" }]
      : sort === "closing"
        ? [{ expectedCloseDate: { sort: "asc", nulls: "last" } }, { id: "asc" }]
        : [{ updatedAt: "desc" }, { id: "desc" }];

export async function listDeals(actor: CrmActor, rawFilters: unknown, page: { page: number; pageSize: number }) {
  const f = dealFiltersSchema.parse(rawFilters);
  const where = await buildDealWhere(actor, f);
  const [rows, total, sums] = await Promise.all([
    prisma.deal.findMany({ where, select: dealSelect, orderBy: orderFor(f.sort), skip: (page.page - 1) * page.pageSize, take: page.pageSize }),
    prisma.deal.count({ where }),
    prisma.deal.aggregate({ where, _sum: { amount: true } }),
  ]);
  return {
    items: rows.map(serializeDeal),
    total,
    totalAmount: Number(sums._sum.amount ?? 0),
    page: page.page,
    pageSize: page.pageSize,
  };
}

export async function getDealDetail(actor: CrmActor, id: string) {
  const deal = await loadDeal(actor, id);
  const [stageChanges, org, contact] = await Promise.all([
    prisma.dealStageChange.findMany({
      where: { dealId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: { id: true, fromStageId: true, fromStageName: true, toStageId: true, toStageName: true, toStatus: true, secondsInFrom: true, createdAt: true, actor: { select: { id: true, name: true } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { currency: true } }),
    deal.contactId
      ? prisma.contact.findUnique({
          where: { id: deal.contactId },
          select: { id: true, remoteJid: true, accountId: true, channelAccountId: true, chat: { select: { id: true } }, conversation: { select: { id: true } } },
        })
      : null,
  ]);
  return {
    ...serializeDeal(deal),
    currency: org.currency,
    stageChanges,
    // Id del chat/conversación para abrir la conversación del negocio; la
    // pantalla decide si el usuario tiene acceso a esa cuenta.
    thread: contact?.chat ? { kind: "whatsapp" as const, id: contact.chat.id } : contact?.conversation ? { kind: "channel" as const, id: contact.conversation.id } : null,
  };
}

// ── Tablero ─────────────────────────────────────────────────────────────────

export interface BoardFilters {
  pipelineId?: string;
  ownerId?: string;
  q?: string;
}

const boardFiltersSchema = z.object({ pipelineId: z.string().optional(), ownerId: z.string().optional(), q: z.string().trim().max(200).optional() });

interface StageTotals {
  count: number;
  amount: number;
  weighted: number;
}

// Cuántos negocios, cuánto dinero y cuánto ponderado por probabilidad hay en
// cada etapa del pipeline, con los mismos filtros que las tarjetas.
async function stageTotals(actor: CrmActor, pipelineId: string, f: z.infer<typeof boardFiltersSchema>): Promise<Map<string, StageTotals>> {
  const owner =
    isRestricted(actor) || f.ownerId === "me"
      ? Prisma.sql`AND d.owner_id = ${actor.userId}`
      : f.ownerId === "none"
        ? Prisma.sql`AND d.owner_id IS NULL`
        : f.ownerId
          ? Prisma.sql`AND d.owner_id = ${f.ownerId}`
          : Prisma.empty;
  const search = f.q
    ? Prisma.sql`AND (d.title ILIKE ${"%" + f.q + "%"} OR EXISTS (SELECT 1 FROM people p WHERE p.id = d.person_id AND p.name ILIKE ${"%" + f.q + "%"}))`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ stage_id: string; count: number; amount: Prisma.Decimal; weighted: Prisma.Decimal }>>`
    SELECT d.stage_id,
           COUNT(*)::int AS count,
           COALESCE(SUM(d.amount), 0) AS amount,
           COALESCE(SUM(d.amount * (CASE s.outcome WHEN 'WON' THEN 100 WHEN 'LOST' THEN 0 ELSE COALESCE(d.probability, s.probability) END) / 100.0), 0) AS weighted
    FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE d.organization_id = ${actor.organizationId} AND d.pipeline_id = ${pipelineId} AND d.archived_at IS NULL
    ${owner} ${search}
    GROUP BY d.stage_id`;
  return new Map(rows.map((r) => [r.stage_id, { count: r.count, amount: roundMoney(Number(r.amount)), weighted: roundMoney(Number(r.weighted)) }]));
}

// Una página de una columna del tablero: los negocios más recientemente
// llegados a la etapa primero (keyset por fecha de entrada + id, estable
// aunque lleguen negocios nuevos mientras se pagina).
export async function listStageColumn(actor: CrmActor, stageId: string, rawFilters: unknown, cursor: string | null, limit = 20) {
  const f = boardFiltersSchema.parse(rawFilters);
  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipeline: { organizationId: actor.organizationId } }, select: { id: true, pipelineId: true } });
  if (!stage) throw notFound("Etapa");
  const take = Math.min(Math.max(limit, 1), 50);

  const base = await buildDealWhere(actor, { pipelineId: stage.pipelineId, stageId, ownerId: f.ownerId, q: f.q });
  const and: Prisma.DealWhereInput[] = [base];
  if (cursor) {
    const c = decodeCursor(cursor);
    and.push({ OR: [{ stageEnteredAt: { lt: c.t } }, { stageEnteredAt: c.t, id: { lt: c.id } }] });
  }
  const rows = await prisma.deal.findMany({
    where: { AND: and },
    select: dealSelect,
    orderBy: [{ stageEnteredAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return {
    items: page.map(serializeDeal),
    nextCursor: rows.length > take && last ? encodeCursor(last.stageEnteredAt, last.id) : null,
  };
}

export async function getBoard(actor: CrmActor, rawFilters: unknown, limit = 20) {
  const f = boardFiltersSchema.parse(rawFilters);
  const pipelineId = f.pipelineId ?? (await ensureDefaultPipeline(actor.organizationId)).pipelineId;
  const [pipeline, org] = await Promise.all([
    prisma.pipeline.findFirst({
      where: { id: pipelineId, organizationId: actor.organizationId },
      select: { id: true, name: true, isDefault: true, archivedAt: true, stages: { orderBy: { position: "asc" }, select: { id: true, name: true, color: true, outcome: true, probability: true, position: true } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { currency: true } }),
  ]);
  if (!pipeline) throw notFound("Pipeline");

  const [totals, columns] = await Promise.all([
    stageTotals(actor, pipelineId, f),
    Promise.all(pipeline.stages.map((s) => listStageColumn(actor, s.id, f, null, limit))),
  ]);
  return {
    currency: org.currency,
    pipeline: { id: pipeline.id, name: pipeline.name, isDefault: pipeline.isDefault, archived: !!pipeline.archivedAt },
    columns: pipeline.stages.map((stage, i) => ({
      stage,
      ...(totals.get(stage.id) ?? { count: 0, amount: 0, weighted: 0 }),
      items: columns[i].items,
      nextCursor: columns[i].nextCursor,
    })),
  };
}

// ── Cursor ──────────────────────────────────────────────────────────────────

function encodeCursor(t: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: t.toISOString(), id })).toString("base64url");
}

function decodeCursor(cursor: string): { t: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { t?: string; id?: string };
    const t = new Date(parsed.t ?? "");
    if (!parsed.id || Number.isNaN(t.getTime())) throw new Error("bad");
    return { t, id: parsed.id };
  } catch {
    throw new CrmError(400, "invalid_request", "Cursor inválido");
  }
}

export type { DealStatus };
