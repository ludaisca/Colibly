import { Prisma, type AutomationRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { automationRunQueue } from "@/lib/queue";
import type { AccountRef, ChatRef } from "@/lib/events/types";
import { execute, type Outcome } from "./executor";
import { createRunAdapters } from "./adapters";
import { parseSettings } from "./settings";
import type { Graph, RunInput, RunState, TriggerType, WaitingReply } from "./types";

// Capa con base de datos del motor: arrancar, reanudar y avanzar ejecuciones.
// El ejecutor (executor.ts) es puro; aquí vive todo lo que toca Prisma y
// BullMQ: candados, guardas de arranque, persistencia de resultados y reintentos.

// Estados en los que una ejecución sigue "viva".
export const LIVE_STATUSES: AutomationRunStatus[] = ["ACTIVE", "WAITING_DELAY", "WAITING_REPLY", "PAUSED_BY_AGENT"];
// Estados en los que una ejecución conversacional "tiene" el chat (el bot calla).
export const HOLDING_STATUSES: AutomationRunStatus[] = ["ACTIVE", "WAITING_DELAY", "WAITING_REPLY"];

const LOCK_STALE_MS = 5 * 60_000;
const MAX_SEND_ATTEMPTS = 5;
const RETRY_BASE_MINUTES = 15;
// Tope anti-bucles: automatizaciones que se disparan entre sí (A pone una
// etiqueta que dispara B, que cambia la etapa que dispara A...).
const MAX_RUNS_PER_CONTACT_PER_HOUR = 20;

export interface StartRunInput {
  automationId: string;
  contactId: string;
  account: AccountRef;
  chat: ChatRef | null;
  vars?: Record<string, string>;
  // Para "manual": iniciar aunque allowReentry sea false.
  force?: boolean;
}

export type StartRunResult =
  | { started: true; runId: string; conversational: boolean }
  | { started: false; reason: string };

// Crea la ejecución (si pasa las guardas) y la encola. Las comprobaciones y el
// create van en una transacción Serializable: dos disparos simultáneos para el
// mismo contacto (p. ej. dos mensajes seguidos) no deben crear dos ejecuciones.
export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  if (!input.chat) return { started: false, reason: "El contacto no tiene conversación" };

  const automation = await prisma.automation.findUnique({
    where: { id: input.automationId },
    include: { publishedVersion: true },
  });
  if (!automation || automation.status !== "ACTIVE" || !automation.publishedVersion) {
    return { started: false, reason: "La automatización no está activa" };
  }
  const graph = automation.publishedVersion.graph as unknown as Graph;
  const settings = parseSettings(automation.settings, graph.trigger.type as TriggerType);
  const chatWhere = input.chat.kind === "whatsapp" ? { waChatId: input.chat.id } : { conversationId: input.chat.id };

  const attempt = async (): Promise<StartRunResult> =>
    prisma.$transaction(
      async (tx) => {
        const live = await tx.automationRun.findFirst({
          where: { automationId: automation.id, contactId: input.contactId, status: { in: LIVE_STATUSES } },
          select: { id: true },
        });
        if (live) return { started: false, reason: "Ya hay una ejecución en curso para este contacto" } as const;

        if (!settings.allowReentry && !input.force) {
          const previous = await tx.automationRun.findFirst({
            where: { automationId: automation.id, contactId: input.contactId },
            select: { id: true },
          });
          if (previous) return { started: false, reason: "Ya corrió para este contacto (sin reentrada)" } as const;
        }

        const recent = await tx.automationRun.count({
          where: { contactId: input.contactId, startedAt: { gte: new Date(Date.now() - 60 * 60_000) } },
        });
        if (recent >= MAX_RUNS_PER_CONTACT_PER_HOUR) {
          return { started: false, reason: "Demasiadas ejecuciones para este contacto en la última hora (posible bucle)" } as const;
        }

        if (automation.conversational) {
          const holding = await tx.automationRun.findFirst({
            where: { ...chatWhere, conversational: true, status: { in: HOLDING_STATUSES } },
            select: { id: true },
          });
          if (holding) return { started: false, reason: "Otra automatización conversacional ya atiende este chat" } as const;
        }

        const run = await tx.automationRun.create({
          data: {
            automationId: automation.id,
            versionId: automation.publishedVersion!.id,
            contactId: input.contactId,
            ...chatWhere,
            conversational: automation.conversational,
            currentNodeId: graph.steps[0]?.id ?? null,
            vars: input.vars ?? {},
            pendingInput: { kind: "start" },
            status: "ACTIVE",
          },
          select: { id: true },
        });
        return { started: true, runId: run.id, conversational: automation.conversational } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

  let result: StartRunResult;
  try {
    result = await attempt();
  } catch (err) {
    // P2034: conflicto de serialización — otro disparo simultáneo ganó.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return { started: false, reason: "Otro disparo simultáneo ya la inició" };
    }
    throw err;
  }
  if (result.started) await enqueueAdvance(result.runId);
  return result;
}

export async function enqueueAdvance(runId: string, delayMs = 0): Promise<void> {
  await automationRunQueue
    .add("advance", { runId }, { delay: Math.max(0, delayMs), jobId: `${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })
    .catch((err) => console.error("[automations] No se pudo encolar el avance:", err instanceof Error ? err.message : err));
}

// Entrega una entrada (respuesta del cliente, timeout, reanudar) a una
// ejecución y la encola. inputSeq++ avisa al worker que esté avanzando que
// llegó algo nuevo.
export async function deliverInput(runId: string, input: RunInput): Promise<void> {
  await prisma.automationRun.update({
    where: { id: runId },
    data: { pendingInput: input as unknown as Prisma.InputJsonValue, inputSeq: { increment: 1 }, status: "ACTIVE", nextRunAt: null },
  });
  await enqueueAdvance(runId);
}

// Avanza una ejecución: candado → ejecutor → persistir resultado. Seguro de
// llamar dos veces (el segundo no obtiene el candado y sale).
export async function advanceRun(runId: string): Promise<void> {
  const now = new Date();
  const claimed = await prisma.automationRun.updateMany({
    where: {
      id: runId,
      status: "ACTIVE",
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - LOCK_STALE_MS) } }],
    },
    data: { lockedAt: now },
  });
  if (claimed.count === 0) return;

  const run = await prisma.automationRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      version: { select: { graph: true } },
      automation: {
        select: {
          id: true,
          waAccount: { select: { id: true, userId: true } },
          channelAccount: { select: { id: true, userId: true, channel: true } },
        },
      },
    },
  });

  const account: AccountRef | null = run.automation.waAccount
    ? { kind: "whatsapp", id: run.automation.waAccount.id }
    : run.automation.channelAccount
      ? { kind: "channel", id: run.automation.channelAccount.id, channel: run.automation.channelAccount.channel }
      : null;
  const ownerId = run.automation.waAccount?.userId ?? run.automation.channelAccount?.userId ?? null;
  const chat: ChatRef | null = run.waChatId ? { kind: "whatsapp", id: run.waChatId } : run.conversationId ? { kind: "channel", id: run.conversationId } : null;

  if (!account || !ownerId || !chat) {
    await finish(run.id, "FAILED", "La cuenta o la conversación ya no existen", [], null);
    return;
  }

  const graph = run.version.graph as unknown as Graph;
  const state: RunState = {
    nodeId: run.currentNodeId,
    vars: (run.vars as Record<string, string>) ?? {},
    waiting: (run.waiting as WaitingReply | null) ?? null,
  };
  const input: RunInput = (run.pendingInput as RunInput | null) ?? { kind: "resume" };
  const seqAtStart = run.inputSeq;

  const adapters = createRunAdapters({ runId: run.id, automationId: run.automationId, ownerId, account, contactId: run.contactId, chat });

  let result;
  try {
    result = await execute(graph, state, input, adapters);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[automations] Error ejecutando ${run.id}:`, message);
    await finish(run.id, "FAILED", message, [{ nodeId: state.nodeId, nodeType: "error", outcome: "error", detail: message }], state);
    return;
  }

  await persistOutcome(run.id, run.attempts, seqAtStart, result.state, result.outcome, result.logs);
}

async function persistOutcome(
  runId: string,
  attempts: number,
  seqAtStart: number,
  state: RunState,
  outcome: Outcome,
  logs: { nodeId: string | null; nodeType: string; outcome: string; detail: string }[]
): Promise<void> {
  const base = {
    currentNodeId: state.nodeId,
    vars: state.vars as Prisma.InputJsonValue,
    waiting: state.waiting ? (state.waiting as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    lockedAt: null,
  };
  const now = Date.now();

  let data: Prisma.AutomationRunUpdateInput;
  let requeueInMs: number | null = null;
  switch (outcome.status) {
    case "waiting_reply":
      data = { ...base, status: "WAITING_REPLY", nextRunAt: outcome.until, attempts: 0, lastError: null };
      break;
    case "waiting_delay": {
      const delay = outcome.until.getTime() - now;
      if (delay <= 1000) {
        data = { ...base, status: "ACTIVE", nextRunAt: null, attempts: 0 };
        requeueInMs = 0;
      } else {
        data = { ...base, status: "WAITING_DELAY", nextRunAt: outcome.until, attempts: 0, lastError: null };
        requeueInMs = delay;
      }
      break;
    }
    case "retry": {
      const next = attempts + 1;
      if (next >= MAX_SEND_ATTEMPTS) {
        data = { ...base, status: "FAILED", lastError: outcome.error, attempts: next, endedAt: new Date(), nextRunAt: null };
      } else {
        const wait = RETRY_BASE_MINUTES * 2 ** (next - 1) * 60_000;
        data = { ...base, status: "WAITING_DELAY", lastError: outcome.error, attempts: next, nextRunAt: new Date(now + wait) };
        requeueInMs = wait;
      }
      break;
    }
    case "completed":
      data = { ...base, status: "COMPLETED", endedAt: new Date(), nextRunAt: null, lastError: null };
      break;
    case "handed_off":
      data = { ...base, status: "HANDED_OFF", endedAt: new Date(), nextRunAt: null };
      break;
    case "handed_to_bot":
      data = { ...base, status: "HANDED_TO_BOT", endedAt: new Date(), nextRunAt: null };
      break;
    case "expired":
      data = { ...base, status: "EXPIRED", endedAt: new Date(), nextRunAt: null, lastError: outcome.error };
      break;
    case "failed":
      data = { ...base, status: "FAILED", endedAt: new Date(), nextRunAt: null, lastError: outcome.error };
      break;
  }

  // Si llegó otra entrada mientras avanzábamos (inputSeq cambió), no se borra
  // pendingInput y se vuelve a avanzar de inmediato para procesarla.
  const newerInput = await prisma.$transaction(async (tx) => {
    const current = await tx.automationRun.findUniqueOrThrow({ where: { id: runId }, select: { inputSeq: true, status: true } });
    const changed = current.inputSeq !== seqAtStart;
    const terminal = typeof data.status === "string" && !LIVE_STATUSES.includes(data.status as AutomationRunStatus);
    await tx.automationRun.update({
      where: { id: runId },
      data: changed && !terminal ? { ...data, status: "ACTIVE", nextRunAt: null } : { ...data, pendingInput: Prisma.DbNull },
    });
    if (logs.length > 0) {
      await tx.automationRunLog.createMany({
        data: logs.map((l) => ({ runId, nodeId: l.nodeId, nodeType: l.nodeType, outcome: l.outcome, detail: l.detail.slice(0, 2000) })),
      });
    }
    return changed && !terminal;
  });

  if (newerInput) await enqueueAdvance(runId);
  else if (requeueInMs !== null) await enqueueAdvance(runId, requeueInMs);
}

async function finish(
  runId: string,
  status: AutomationRunStatus,
  error: string,
  logs: { nodeId: string | null; nodeType: string; outcome: string; detail: string }[],
  state: RunState | null
) {
  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status,
      lastError: error,
      endedAt: new Date(),
      lockedAt: null,
      nextRunAt: null,
      pendingInput: Prisma.DbNull,
      ...(state ? { currentNodeId: state.nodeId } : {}),
    },
  });
  if (logs.length) await prisma.automationRunLog.createMany({ data: logs.map((l) => ({ runId, ...l })) });
}

// Tick de respaldo (cada minuto): esperas vencidas cuyo job diferido se
// perdió (Redis reiniciado) y ejecuciones con candado huérfano.
export async function processAutomationTick(): Promise<void> {
  const now = new Date();
  const due = await prisma.automationRun.findMany({
    where: { status: { in: ["WAITING_DELAY", "WAITING_REPLY"] }, nextRunAt: { lte: now } },
    select: { id: true, status: true },
    orderBy: { nextRunAt: "asc" },
    take: 200,
  });
  for (const run of due) {
    // Reclamo atómico del cambio de estado: si el job diferido ya la tomó,
    // count = 0 y no se duplica.
    const claimed = await prisma.automationRun.updateMany({
      where: { id: run.id, status: run.status, nextRunAt: { lte: now } },
      data: {
        status: "ACTIVE",
        nextRunAt: null,
        pendingInput: (run.status === "WAITING_REPLY" ? { kind: "timeout" } : { kind: "resume" }) as Prisma.InputJsonValue,
        inputSeq: { increment: 1 },
      },
    });
    if (claimed.count > 0) await enqueueAdvance(run.id);
  }

  const orphaned = await prisma.automationRun.findMany({
    where: {
      status: "ACTIVE",
      updatedAt: { lt: new Date(now.getTime() - 2 * 60_000) },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - LOCK_STALE_MS) } }],
    },
    select: { id: true },
    take: 100,
  });
  for (const run of orphaned) await enqueueAdvance(run.id);
}

// Job diferido de una espera de tiempo: pasa a ACTIVE si sigue esperando.
export async function wakeRun(runId: string): Promise<void> {
  const run = await prisma.automationRun.findUnique({ where: { id: runId }, select: { status: true, nextRunAt: true } });
  if (!run) return;
  if (run.status === "ACTIVE") return advanceRun(runId);
  if (run.status === "WAITING_DELAY" && run.nextRunAt && run.nextRunAt.getTime() <= Date.now() + 1000) {
    const claimed = await prisma.automationRun.updateMany({
      where: { id: runId, status: "WAITING_DELAY" },
      data: { status: "ACTIVE", nextRunAt: null, pendingInput: { kind: "resume" }, inputSeq: { increment: 1 } },
    });
    if (claimed.count > 0) await advanceRun(runId);
  }
}
