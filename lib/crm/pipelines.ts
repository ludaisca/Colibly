import { Prisma, type DealStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CrmError, invalid, notFound } from "@/lib/crm/errors";
import { requireRoles, type CrmActor } from "@/lib/crm/access";
import { isSupportedCurrency, stageProbability, validateStageSet } from "@/lib/crm/deal-rules";

// Pipelines, etapas, motivos de pérdida y moneda de la organización.
// Todo se lee con cualquier rol (el ejecutivo también ve los embudos); solo el
// admin los configura.

// Etapas con las que nace un pipeline. Mismo catálogo que la migración
// `crm_deals_pipelines` (que sembró las organizaciones existentes): si cambia
// uno, cambia el otro. `metaEvent` es el nombre del evento de la Conversions
// API que se reporta al entrar un negocio de anuncio (null = no se reporta).
export const DEFAULT_STAGES = [
  { key: "new", name: "Nuevo", color: "info", outcome: "OPEN", probability: 10, metaEvent: null },
  { key: "contacted", name: "Contactado", color: "warning", outcome: "OPEN", probability: 25, metaEvent: "Contact" },
  { key: "qualified", name: "Calificado", color: "accent", outcome: "OPEN", probability: 50, metaEvent: "Lead" },
  { key: "won", name: "Ganado", color: "success", outcome: "WON", probability: 100, metaEvent: "Purchase" },
  { key: "lost", name: "Perdido", color: "muted", outcome: "LOST", probability: 0, metaEvent: "LeadLost" },
] as const satisfies ReadonlyArray<{ key: string; name: string; color: string; outcome: DealStatus; probability: number; metaEvent: string | null }>;

export const DEFAULT_LOSS_REASONS = ["Precio", "Sin respuesta", "Compró con la competencia", "Ya no le interesa", "Otro"] as const;

export const STAGE_COLORS = ["info", "warning", "accent", "success", "danger", "muted"] as const;

export const MAX_PIPELINES = 10;
export const MAX_STAGES = 25;

type Db = Prisma.TransactionClient | typeof prisma;

// ── Siembra ─────────────────────────────────────────────────────────────────

async function createPipelineWithStages(tx: Prisma.TransactionClient, organizationId: string, name: string, opts: { isDefault: boolean; position: number }) {
  const pipeline = await tx.pipeline.create({
    data: { organizationId, name, isDefault: opts.isDefault, position: opts.position },
    select: { id: true },
  });
  await tx.pipelineStage.createMany({
    data: DEFAULT_STAGES.map((s, i) => ({
      pipelineId: pipeline.id,
      name: s.name,
      position: i,
      color: s.color,
      outcome: s.outcome,
      probability: s.probability,
      metaEvent: s.metaEvent,
    })),
  });
  return pipeline.id;
}

async function seedLossReasons(tx: Prisma.TransactionClient, organizationId: string) {
  if (await tx.lossReason.count({ where: { organizationId } })) return;
  await tx.lossReason.createMany({ data: DEFAULT_LOSS_REASONS.map((name, position) => ({ organizationId, name, position })) });
}

// Pipeline "Ventas" + motivos de pérdida para una organización recién creada.
export async function seedOrganizationPipeline(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  await createPipelineWithStages(tx, organizationId, "Ventas", { isDefault: true, position: 0 });
  await seedLossReasons(tx, organizationId);
}

export interface DefaultPipelineEntry {
  pipelineId: string;
  firstStageId: string;
  autoCreateDeals: boolean;
}

async function readDefaultPipeline(db: Db, organizationId: string): Promise<DefaultPipelineEntry | null> {
  const pipeline = await db.pipeline.findFirst({
    where: { organizationId, isDefault: true, archivedAt: null },
    select: { id: true, autoCreateDeals: true, stages: { orderBy: { position: "asc" }, take: 1, select: { id: true } } },
  });
  if (!pipeline?.stages[0]) return null;
  return { pipelineId: pipeline.id, firstStageId: pipeline.stages[0].id, autoCreateDeals: pipeline.autoCreateDeals };
}

// Pipeline predeterminado de la organización y su primera etapa. Las
// organizaciones nuevas y las existentes ya lo traen sembrado; esto cubre el
// caso raro de que se haya borrado o archivado (se vuelve a sembrar, con un
// candado para que dos peticiones simultáneas no creen dos).
export async function ensureDefaultPipeline(organizationId: string, tx?: Prisma.TransactionClient): Promise<DefaultPipelineEntry> {
  const found = await readDefaultPipeline(tx ?? prisma, organizationId);
  if (found) return found;

  const run = async (t: Prisma.TransactionClient) => {
    await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pipeline:" + organizationId}))`;
    const again = await readDefaultPipeline(t, organizationId);
    if (again) return again;
    // Otro pipeline (no archivado) puede tomar el relevo de predeterminado.
    const other = await t.pipeline.findFirst({ where: { organizationId, archivedAt: null }, orderBy: { position: "asc" }, select: { id: true } });
    if (other) {
      await t.pipeline.update({ where: { id: other.id }, data: { isDefault: true } });
      const entry = await readDefaultPipeline(t, organizationId);
      if (entry) return entry;
    }
    const position = await t.pipeline.count({ where: { organizationId } });
    await createPipelineWithStages(t, organizationId, "Ventas", { isDefault: true, position });
    await seedLossReasons(t, organizationId);
    const entry = await readDefaultPipeline(t, organizationId);
    if (!entry) throw new CrmError(500, "pipeline_seed_failed", "No se pudo preparar el pipeline");
    return entry;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export async function listPipelines(actor: CrmActor, opts: { includeArchived?: boolean } = {}) {
  await ensureDefaultPipeline(actor.organizationId);
  const [pipelines, counts, org] = await Promise.all([
    prisma.pipeline.findMany({
      where: { organizationId: actor.organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { stages: { orderBy: { position: "asc" } } },
    }),
    prisma.deal.groupBy({
      by: ["stageId"],
      where: { organizationId: actor.organizationId, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { currency: true } }),
  ]);
  const byStage = new Map(counts.map((c) => [c.stageId, c._count._all]));
  return {
    currency: org.currency,
    items: pipelines.map((p) => ({
      ...p,
      stages: p.stages.map((s) => ({ ...s, dealCount: byStage.get(s.id) ?? 0 })),
    })),
  };
}

async function loadPipeline(organizationId: string, id: string) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id, organizationId } });
  if (!pipeline) throw notFound("Pipeline");
  return pipeline;
}

// ── Pipelines ───────────────────────────────────────────────────────────────

const pipelineCreateSchema = z.object({ name: z.string().trim().min(1, "Indica el nombre").max(80), autoCreateDeals: z.boolean().optional() });
const pipelineUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isDefault: z.boolean().optional(),
  autoCreateDeals: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function createPipeline(actor: CrmActor, raw: unknown) {
  requireRoles(actor, ["admin"]);
  const input = pipelineCreateSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.pipeline.findMany({ where: { organizationId: actor.organizationId, archivedAt: null }, select: { name: true } });
    if (existing.length >= MAX_PIPELINES) throw invalid(`Máximo ${MAX_PIPELINES} pipelines`);
    if (existing.some((p) => p.name.toLowerCase() === input.name.toLowerCase())) throw new CrmError(409, "duplicate_name", "Ya tienes un pipeline con ese nombre");
    const position = await tx.pipeline.count({ where: { organizationId: actor.organizationId } });
    const id = await createPipelineWithStages(tx, actor.organizationId, input.name, { isDefault: false, position });
    if (input.autoCreateDeals !== undefined) await tx.pipeline.update({ where: { id }, data: { autoCreateDeals: input.autoCreateDeals } });
    await seedLossReasons(tx, actor.organizationId);
    return tx.pipeline.findUniqueOrThrow({ where: { id }, include: { stages: { orderBy: { position: "asc" } } } });
  });
}

export async function updatePipeline(actor: CrmActor, id: string, raw: unknown) {
  requireRoles(actor, ["admin"]);
  const input = pipelineUpdateSchema.parse(raw);
  const pipeline = await loadPipeline(actor.organizationId, id);

  return prisma.$transaction(async (tx) => {
    const data: Prisma.PipelineUpdateInput = {};
    if (input.name !== undefined && input.name !== pipeline.name) {
      const clash = await tx.pipeline.findFirst({
        where: { organizationId: actor.organizationId, archivedAt: null, id: { not: id }, name: { equals: input.name, mode: "insensitive" } },
        select: { id: true },
      });
      if (clash) throw new CrmError(409, "duplicate_name", "Ya tienes un pipeline con ese nombre");
      data.name = input.name;
    }
    if (input.autoCreateDeals !== undefined) data.autoCreateDeals = input.autoCreateDeals;

    if (input.archived === true && !pipeline.archivedAt) {
      if (pipeline.isDefault) throw new CrmError(409, "default_pipeline", "El pipeline predeterminado no se archiva: elige otro como predeterminado primero");
      const open = await tx.deal.count({ where: { pipelineId: id, status: "OPEN", archivedAt: null } });
      if (open) throw new CrmError(409, "pipeline_has_open_deals", `Aún tiene ${open} negocio(s) abiertos: ciérralos o muévelos a otro pipeline`, { open });
      data.archivedAt = new Date();
    } else if (input.archived === false && pipeline.archivedAt) {
      data.archivedAt = null;
    }

    if (input.isDefault === true && !pipeline.isDefault) {
      if (pipeline.archivedAt && input.archived !== false) throw invalid("Un pipeline archivado no puede ser el predeterminado");
      await tx.pipeline.updateMany({ where: { organizationId: actor.organizationId, isDefault: true }, data: { isDefault: false } });
      data.isDefault = true;
    } else if (input.isDefault === false && pipeline.isDefault) {
      throw invalid("Elige otro pipeline como predeterminado en vez de quitarle la marca a este");
    }

    if (Object.keys(data).length) await tx.pipeline.update({ where: { id }, data });
    return tx.pipeline.findUniqueOrThrow({ where: { id }, include: { stages: { orderBy: { position: "asc" } } } });
  });
}

export async function deletePipeline(actor: CrmActor, id: string) {
  requireRoles(actor, ["admin"]);
  const pipeline = await loadPipeline(actor.organizationId, id);
  if (pipeline.isDefault) throw new CrmError(409, "default_pipeline", "El pipeline predeterminado no se puede borrar");
  const deals = await prisma.deal.count({ where: { pipelineId: id } });
  if (deals) throw new CrmError(409, "pipeline_has_deals", "Tiene negocios: archívalo en vez de borrarlo", { deals });
  await prisma.pipeline.delete({ where: { id } });
  return { ok: true };
}

// ── Etapas ──────────────────────────────────────────────────────────────────

const outcomeSchema = z.enum(["OPEN", "WON", "LOST"]);
const stageFields = {
  name: z.string().trim().min(1, "Indica el nombre").max(60),
  color: z.enum(STAGE_COLORS),
  probability: z.number().int().min(0).max(100).optional(),
  metaEvent: z.string().trim().max(60).nullable().optional(),
};
const stageCreateSchema = z.object({ ...stageFields, color: stageFields.color.optional(), outcome: outcomeSchema.optional(), position: z.number().int().min(0).optional() });
const stageUpdateSchema = z.object({
  name: stageFields.name.optional(),
  color: stageFields.color.optional(),
  outcome: outcomeSchema.optional(),
  probability: stageFields.probability,
  metaEvent: stageFields.metaEvent,
});

async function checkStageSet(tx: Prisma.TransactionClient, pipelineId: string): Promise<void> {
  const stages = await tx.pipelineStage.findMany({ where: { pipelineId }, orderBy: { position: "asc" }, select: { name: true, outcome: true, probability: true } });
  const problem = validateStageSet(stages);
  if (problem) throw invalid(problem);
  if (stages.length > MAX_STAGES) throw invalid(`Máximo ${MAX_STAGES} etapas por pipeline`);
}

// Deja las posiciones consecutivas 0..n-1 (tras insertar, borrar o reordenar).
async function compactPositions(tx: Prisma.TransactionClient, pipelineId: string): Promise<void> {
  const stages = await tx.pipelineStage.findMany({ where: { pipelineId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, position: true } });
  for (const [i, s] of stages.entries()) if (s.position !== i) await tx.pipelineStage.update({ where: { id: s.id }, data: { position: i } });
}

export async function createStage(actor: CrmActor, pipelineId: string, raw: unknown) {
  requireRoles(actor, ["admin"]);
  const input = stageCreateSchema.parse(raw);
  await loadPipeline(actor.organizationId, pipelineId);
  const outcome = input.outcome ?? "OPEN";
  return prisma.$transaction(async (tx) => {
    const count = await tx.pipelineStage.count({ where: { pipelineId } });
    // Sin posición, una etapa abierta va antes de las de cierre.
    let position = input.position ?? count;
    if (input.position === undefined && outcome === "OPEN") {
      const firstClosed = await tx.pipelineStage.findFirst({ where: { pipelineId, outcome: { not: "OPEN" } }, orderBy: { position: "asc" }, select: { position: true } });
      if (firstClosed) position = firstClosed.position;
    }
    position = Math.min(position, count);
    await tx.pipelineStage.updateMany({ where: { pipelineId, position: { gte: position } }, data: { position: { increment: 1 } } });
    const stage = await tx.pipelineStage.create({
      data: {
        pipelineId,
        name: input.name,
        position,
        color: input.color ?? (outcome === "WON" ? "success" : outcome === "LOST" ? "muted" : "info"),
        outcome,
        probability: stageProbability(outcome, input.probability),
        metaEvent: input.metaEvent?.trim() || null,
      },
    });
    await compactPositions(tx, pipelineId);
    await checkStageSet(tx, pipelineId);
    return stage;
  });
}

async function loadStage(organizationId: string, id: string) {
  const stage = await prisma.pipelineStage.findFirst({ where: { id, pipeline: { organizationId } }, include: { pipeline: { select: { id: true } } } });
  if (!stage) throw notFound("Etapa");
  return stage;
}

export async function updateStage(actor: CrmActor, id: string, raw: unknown) {
  requireRoles(actor, ["admin"]);
  const input = stageUpdateSchema.parse(raw);
  const stage = await loadStage(actor.organizationId, id);

  return prisma.$transaction(async (tx) => {
    const outcome = input.outcome ?? stage.outcome;
    if (outcome !== stage.outcome) {
      // Cambiar lo que significa la etapa reinterpretaría negocios que ya están
      // en ella (su estado, fecha de cierre y motivo): primero se mueven.
      const deals = await tx.deal.count({ where: { stageId: id } });
      if (deals) throw new CrmError(409, "stage_has_deals", "La etapa tiene negocios: muévelos a otra antes de cambiar su tipo", { deals });
    }
    const data: Prisma.PipelineStageUpdateInput = { outcome };
    if (input.name !== undefined) data.name = input.name;
    if (input.color !== undefined) data.color = input.color;
    if (input.metaEvent !== undefined) data.metaEvent = input.metaEvent?.trim() || null;
    if (input.probability !== undefined || outcome !== stage.outcome) data.probability = stageProbability(outcome, input.probability ?? stage.probability);
    const updated = await tx.pipelineStage.update({ where: { id }, data });
    await checkStageSet(tx, stage.pipelineId);
    return updated;
  });
}

// Reordena todas las etapas del pipeline: `ids` debe traer cada una exactamente una vez.
export async function reorderStages(actor: CrmActor, pipelineId: string, raw: unknown) {
  requireRoles(actor, ["admin"]);
  const { ids } = z.object({ ids: z.array(z.string().min(1)).min(1) }).parse(raw);
  await loadPipeline(actor.organizationId, pipelineId);
  return prisma.$transaction(async (tx) => {
    const current = await tx.pipelineStage.findMany({ where: { pipelineId }, select: { id: true } });
    const known = new Set(current.map((s) => s.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((i) => !known.has(i))) {
      throw invalid("La lista debe incluir cada etapa del pipeline exactamente una vez");
    }
    for (const [i, stageId] of ids.entries()) await tx.pipelineStage.update({ where: { id: stageId }, data: { position: i } });
    await checkStageSet(tx, pipelineId);
    return tx.pipelineStage.findMany({ where: { pipelineId }, orderBy: { position: "asc" } });
  });
}

// Borra una etapa. Si tiene negocios hay que decir a cuál se mueven (de su
// mismo pipeline); el movimiento queda en el historial de cada negocio.
export async function deleteStage(actor: CrmActor, id: string, moveToStageId: string | null) {
  requireRoles(actor, ["admin"]);
  const stage = await loadStage(actor.organizationId, id);

  return prisma.$transaction(async (tx) => {
    const deals = await tx.deal.findMany({ where: { stageId: id }, select: { id: true, stageEnteredAt: true, status: true } });
    if (deals.length) {
      if (!moveToStageId) throw new CrmError(409, "stage_has_deals", `La etapa tiene ${deals.length} negocio(s): indica a qué etapa moverlos`, { deals: deals.length });
      if (moveToStageId === id) throw invalid("Elige una etapa distinta");
      const target = await tx.pipelineStage.findFirst({ where: { id: moveToStageId, pipelineId: stage.pipelineId } });
      if (!target) throw invalid("La etapa destino debe ser del mismo pipeline");
      if (target.outcome !== stage.outcome) {
        throw invalid("Los negocios solo pueden moverse a una etapa del mismo tipo (abierta, ganada o perdida)");
      }
      const now = new Date();
      await tx.deal.updateMany({ where: { stageId: id }, data: { stageId: target.id, stageEnteredAt: now, version: { increment: 1 } } });
      await tx.dealStageChange.createMany({
        data: deals.map((d) => ({
          organizationId: actor.organizationId,
          dealId: d.id,
          fromStageId: stage.id,
          fromStageName: stage.name,
          toStageId: target.id,
          toStageName: target.name,
          toStatus: target.outcome,
          actorId: actor.userId,
          secondsInFrom: Math.max(0, Math.floor((now.getTime() - d.stageEnteredAt.getTime()) / 1000)),
        })),
      });
    }
    await tx.pipelineStage.delete({ where: { id } });
    await compactPositions(tx, stage.pipelineId);
    await checkStageSet(tx, stage.pipelineId);
    return { ok: true, moved: deals.length };
  });
}

// ── Motivos de pérdida ──────────────────────────────────────────────────────

const lossReasonCreateSchema = z.object({ name: z.string().trim().min(1, "Indica el motivo").max(80) });
const lossReasonUpdateSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), archived: z.boolean().optional(), position: z.number().int().min(0).optional() });

export async function listLossReasons(actor: CrmActor, includeArchived = false) {
  await ensureDefaultPipeline(actor.organizationId);
  return prisma.lossReason.findMany({
    where: { organizationId: actor.organizationId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function createLossReason(actor: CrmActor, raw: unknown) {
  requireRoles(actor, ["admin"]);
  const { name } = lossReasonCreateSchema.parse(raw);
  const clash = await prisma.lossReason.findFirst({ where: { organizationId: actor.organizationId, archivedAt: null, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (clash) throw new CrmError(409, "duplicate_name", "Ya existe ese motivo");
  const position = await prisma.lossReason.count({ where: { organizationId: actor.organizationId } });
  return prisma.lossReason.create({ data: { organizationId: actor.organizationId, name, position } });
}

export async function updateLossReason(actor: CrmActor, id: string, raw: unknown) {
  requireRoles(actor, ["admin"]);
  const input = lossReasonUpdateSchema.parse(raw);
  const reason = await prisma.lossReason.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!reason) throw notFound("Motivo");
  if (input.archived === true && !reason.archivedAt) {
    // Siempre debe quedar al menos un motivo elegible: perder exige uno.
    const others = await prisma.lossReason.count({ where: { organizationId: actor.organizationId, archivedAt: null, id: { not: id } } });
    if (!others) throw invalid("Debe quedar al menos un motivo de pérdida activo");
  }
  return prisma.lossReason.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    },
  });
}

// ── Moneda de la organización ───────────────────────────────────────────────

export async function updateCurrency(actor: CrmActor, raw: unknown) {
  requireRoles(actor, ["admin"]);
  const { currency } = z.object({ currency: z.string().trim().toUpperCase() }).parse(raw);
  if (!isSupportedCurrency(currency)) throw invalid("Moneda no admitida");
  await prisma.organization.update({ where: { id: actor.organizationId }, data: { currency } });
  return { currency };
}
