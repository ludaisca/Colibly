import { Prisma, type LeadStatus, type PipelineStageOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ContactScopeWhere } from "@/lib/contacts/scope";
import type { LeadCardData } from "@/app/components/pipeline/lead-card";
import { summarizeStages, type StageCountRow, type StageSummary } from "./board-rules";

// Datos del tablero del embudo, por columna. Antes la página traía TODOS los
// contactos del embudo con etiquetas, chat y todas sus calificaciones para
// pintar miles de tarjetas: con ~1,350 leads tardaba más de 20 s. Ahora cada
// columna trae solo su primera página (CARD_PAGE) y los conteos y sumas salen
// de un GROUP BY en la base; «Cargar más» pide la siguiente página por API.

export const CARD_PAGE = 50;

export interface BoardStageRef {
  id: string;
  leadStatus: LeadStatus | null;
  outcome: PipelineStageOutcome;
}

/**
 * Contactos de una columna. En el embudo principal, un contacto sin etapa
 * (pipelineStageId null) cae en la etapa de su leadStatus.
 */
export function stageContactsWhere(stage: BoardStageRef, isDefault: boolean): Prisma.ContactWhereInput {
  if (isDefault && stage.leadStatus) {
    return { OR: [{ pipelineStageId: stage.id }, { pipelineStageId: null, leadStatus: stage.leadStatus }] };
  }
  return { pipelineStageId: stage.id };
}

/** Conteos y sumas por columna (todo, y solo lo real para los KPIs): una consulta. */
export async function stageSummaries(
  scope: ContactScopeWhere,
  stages: BoardStageRef[],
  isDefault: boolean
): Promise<Record<string, StageSummary>> {
  const stageIds = stages.map((stage) => stage.id);
  const rows = await prisma.contact.groupBy({
    by: ["pipelineStageId", "leadStatus", "isSample"],
    where: {
      AND: [scope as Prisma.ContactWhereInput, { OR: [{ pipelineStageId: { in: stageIds } }, ...(isDefault ? [{ pipelineStageId: null }] : [])] }],
    },
    _count: { _all: true },
    _sum: { dealValueCents: true },
  });
  const counts: StageCountRow[] = rows.map((row) => ({
    pipelineStageId: row.pipelineStageId,
    leadStatus: row.leadStatus,
    isSample: row.isSample,
    count: row._count._all,
    valueCents: row._sum.dealValueCents ?? 0,
  }));
  return summarizeStages(counts, stages, isDefault);
}

const cardSelect = {
  id: true,
  name: true,
  remoteJid: true,
  leadStatus: true,
  dealValueCents: true,
  expectedCloseAt: true,
  stageEnteredAt: true,
  accountId: true,
  channelAccountId: true,
  isSample: true,
  channelAccount: { select: { channel: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  chat: { select: { id: true, lastMessageAt: true, unreadCount: true, assignedTo: { select: { id: true, name: true } } } },
  conversation: { select: { lastMessageAt: true, unreadCount: true, assignedTo: { select: { id: true, name: true } } } },
} satisfies Prisma.ContactSelect;

/**
 * Una página de tarjetas de una columna, lo más reciente primero. Con
 * `staleBefore` solo los leads reales que entraron a la etapa antes de esa
 * fecha (el filtro «Ver esos leads» del aviso de detenidos).
 */
export async function loadStageCards(input: {
  scope: ContactScopeWhere;
  stage: BoardStageRef;
  isDefault: boolean;
  skip?: number;
  take?: number;
  staleBefore?: Date;
}): Promise<LeadCardData[]> {
  const { stage } = input;
  const contacts = await prisma.contact.findMany({
    where: {
      AND: [
        input.scope as Prisma.ContactWhereInput,
        stageContactsWhere(stage, input.isDefault),
        ...(input.staleBefore ? [{ isSample: false, stageEnteredAt: { lt: input.staleBefore } }] : []),
      ],
    },
    select: cardSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: input.skip ?? 0,
    take: input.take ?? CARD_PAGE,
  });

  // La mejor calificación por chat en una consulta (DISTINCT ON): la relación
  // anidada con take: 1 hacía que Prisma leyera todas y recortara en memoria.
  const chatIds = contacts.map((contact) => contact.chat?.id).filter((id): id is string => !!id);
  const scores = chatIds.length
    ? await prisma.$queryRaw<Array<{ chatId: string; score: number; label: string }>>(Prisma.sql`
        SELECT DISTINCT ON (s."chatId") s."chatId", s.score, s.label
        FROM wa_lead_scores s
        WHERE s."chatId" = ANY(${chatIds})
        ORDER BY s."chatId", s.score DESC`)
    : [];
  const scoreByChat = new Map(scores.map((row) => [row.chatId, { score: Number(row.score), label: row.label }]));

  return contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    remoteJid: contact.remoteJid,
    leadStatus: contact.leadStatus,
    stageId: stage.id,
    accountId: contact.accountId,
    isSample: contact.isSample,
    lineAccountId: contact.accountId ?? contact.channelAccountId,
    channel: contact.accountId ? "WHATSAPP" : contact.channelAccount?.channel ?? "WHATSAPP",
    tags: contact.tags,
    bestScore: contact.chat ? scoreByChat.get(contact.chat.id) ?? null : null,
    lastMessageAt: contact.chat?.lastMessageAt?.toISOString() ?? contact.conversation?.lastMessageAt?.toISOString() ?? null,
    unreadCount: (contact.chat?.unreadCount ?? 0) + (contact.conversation?.unreadCount ?? 0),
    dealValueCents: contact.dealValueCents,
    expectedCloseAt: contact.expectedCloseAt?.toISOString() ?? null,
    stageEnteredAt: contact.stageEnteredAt.toISOString(),
    assignee: contact.chat?.assignedTo ?? contact.conversation?.assignedTo ?? null,
    closed: stage.outcome !== "OPEN",
  }));
}

/** Leads reales detenidos en una etapa (entraron antes de `staleBefore`). */
export function countStaleCards(scope: ContactScopeWhere, stage: BoardStageRef, isDefault: boolean, staleBefore: Date): Promise<number> {
  return prisma.contact.count({
    where: {
      AND: [scope as Prisma.ContactWhereInput, stageContactsWhere(stage, isDefault), { isSample: false, stageEnteredAt: { lt: staleBefore } }],
    },
  });
}
