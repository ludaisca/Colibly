import type { Automation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AccountRef, ChatRef, DomainEvent } from "@/lib/events/types";
import { normalize } from "./match-reply";
import { deliverInput, HOLDING_STATUSES, startRun } from "./runner";
import { parseSettings } from "./settings";
import type { Trigger, TriggerType } from "./types";

// Punto de entrada del motor desde fuera:
//  - dispatchInboundMessage: la ingesta lo llama con cada mensaje entrante,
//    ANTES de decidir si responde el bot. Devuelve suppressBot=true si una
//    automatización tomó el mensaje (el bot no debe contestar encima).
//  - handleDomainEvent: el worker de domain-events lo llama con cada evento
//    (etiqueta, etapa, cita completada, calificación, lead de anuncio).

export interface InboundContext {
  account: AccountRef;
  chat: ChatRef;
  contactId: string;
  text: string;
  replyId: string | null;
  isFirstMessage: boolean;
}

function accountWhere(account: AccountRef) {
  return account.kind === "whatsapp" ? { waAccountId: account.id } : { channelAccountId: account.id };
}

function chatWhere(chat: ChatRef) {
  return chat.kind === "whatsapp" ? { waChatId: chat.id } : { conversationId: chat.id };
}

export async function dispatchInboundMessage(ctx: InboundContext): Promise<{ suppressBot: boolean }> {
  // 1. Una ejecución esperando respuesta en este chat se la lleva.
  const waiting = await prisma.automationRun.findFirst({
    where: { ...chatWhere(ctx.chat), status: "WAITING_REPLY" },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (waiting) {
    await deliverInput(waiting.id, { kind: "reply", text: ctx.text, replyId: ctx.replyId });
    return { suppressBot: true };
  }

  // 2. Una ejecución conversacional avanzando justo ahora (p. ej. acaba de
  //    mandar botones y aún no quedó en espera): la respuesta se le encola.
  const busy = await prisma.automationRun.findFirst({
    where: { ...chatWhere(ctx.chat), status: "ACTIVE", conversational: true },
    select: { id: true },
  });
  if (busy) {
    await deliverInput(busy.id, { kind: "reply", text: ctx.text, replyId: ctx.replyId });
    return { suppressBot: true };
  }

  // 3. Ejecuciones en una espera de tiempo cuya automatización sale si el
  //    contacto responde (drip / secuencias): terminan aquí.
  const delayed = await prisma.automationRun.findMany({
    where: { ...chatWhere(ctx.chat), status: "WAITING_DELAY" },
    select: { id: true, automation: { select: { settings: true, triggerType: true } } },
  });
  for (const run of delayed) {
    const settings = parseSettings(run.automation.settings, (run.automation.triggerType ?? "manual") as TriggerType);
    if (settings.exitOnReply) {
      await prisma.automationRun.updateMany({
        where: { id: run.id, status: "WAITING_DELAY" },
        data: { status: "EXITED_REPLY", endedAt: new Date(), nextRunAt: null },
      });
    }
  }

  // Una ejecución conversacional en espera de tiempo sigue "teniendo" el chat.
  const holding = await prisma.automationRun.findFirst({
    where: { ...chatWhere(ctx.chat), conversational: true, status: { in: HOLDING_STATUSES } },
    select: { id: true },
  });
  if (holding) return { suppressBot: true };

  // 4. Disparadores por mensaje: palabra clave > primer mensaje > cualquier mensaje.
  const automations = await prisma.automation.findMany({
    where: {
      ...accountWhere(ctx.account),
      status: "ACTIVE",
      triggerType: { in: ["keyword", "first_message", "message_received"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  const ordered = [
    ...automations.filter((a) => a.triggerType === "keyword" && keywordMatches(a, ctx.text)),
    ...(ctx.isFirstMessage ? automations.filter((a) => a.triggerType === "first_message") : []),
    ...automations.filter((a) => a.triggerType === "message_received"),
  ];

  // Solo una automatización arranca por mensaje: la primera que pase las
  // guardas (dos flujos respondiendo el mismo "hola" sería caos).
  for (const automation of ordered) {
    const result = await startRun({
      automationId: automation.id,
      contactId: ctx.contactId,
      account: ctx.account,
      chat: ctx.chat,
      vars: { mensaje: ctx.text },
    });
    if (result.started) return { suppressBot: result.conversational };
  }
  return { suppressBot: false };
}

export function keywordMatches(automation: Pick<Automation, "triggerConfig">, text: string): boolean {
  const config = automation.triggerConfig as Extract<Trigger, { type: "keyword" }> | null;
  if (!config?.keywords?.length) return false;
  const message = normalize(text);
  if (!message) return false;
  return config.keywords.some((raw) => {
    const kw = normalize(raw);
    if (!kw) return false;
    return config.match === "exact" ? message === kw : ` ${message} `.includes(` ${kw} `);
  });
}

// ─── Disparadores por evento de dominio ─────────────────────────────────────

function eventTrigger(event: DomainEvent): { type: TriggerType; matches: (config: Record<string, unknown> | null) => boolean } | null {
  switch (event.type) {
    case "tag.added":
      return {
        type: "tag_added",
        matches: (c) => normalize(String(c?.tagName ?? "")) === normalize(event.data.tagName),
      };
    case "contact.lead_status_changed":
      return { type: "lead_status_changed", matches: (c) => c?.status === event.data.to };
    case "appointment.status_changed":
      return event.data.to === "COMPLETED" ? { type: "appointment_completed", matches: () => true } : null;
    case "lead.scored":
      // Solo cuando la calificación CAMBIA: re-calificar con la misma etiqueta
      // no debe volver a disparar.
      return event.data.label !== event.data.previousLabel
        ? { type: "score_label", matches: (c) => normalize(String(c?.label ?? "")) === normalize(event.data.label) }
        : null;
    case "lead.ad_captured":
      return { type: "ad_lead", matches: (c) => !c?.origin || c.origin === "ANY" || c.origin === event.data.origin };
    default:
      return null;
  }
}

export async function handleDomainEvent(event: DomainEvent): Promise<number> {
  const trigger = eventTrigger(event);
  if (!trigger || !event.contactId) return 0;

  const automations = await prisma.automation.findMany({
    where: { ...accountWhere(event.account), status: "ACTIVE", triggerType: trigger.type },
    select: { id: true, triggerConfig: true },
  });
  let started = 0;
  for (const automation of automations) {
    if (!trigger.matches(automation.triggerConfig as Record<string, unknown> | null)) continue;
    const result = await startRun({
      automationId: automation.id,
      contactId: event.contactId,
      account: event.account,
      chat: event.chat,
    });
    if (result.started) started++;
  }
  return started;
}

// Un agente respondió a mano: las automatizaciones conversacionales de ese
// chat se pausan (se pueden reanudar desde el chat). Mismo espíritu que la
// pausa del bot IA cuando interviene un humano.
export async function pauseConversationalRuns(chat: ChatRef): Promise<number> {
  const { count } = await prisma.automationRun.updateMany({
    where: { ...chatWhere(chat), conversational: true, status: { in: HOLDING_STATUSES } },
    data: { status: "PAUSED_BY_AGENT", nextRunAt: null },
  });
  return count;
}
