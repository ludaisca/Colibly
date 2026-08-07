import { Prisma } from "@prisma/client";
import type { SequenceTriggerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { isWithinServiceWindow } from "@/lib/whatsapp/lead-recovery";

// Roadmap P3-a — motor de secuencias lineales (ver comentario de
// SequenceTriggerType en schema.prisma para el porqué de "sin ramas"). Dos
// entry points: enrollContactInTrigger() (llamado desde los 3 puntos donde
// ocurre un trigger real — tags, contacts PATCH, appointments PATCH) y
// processSequenceTick() (el tick de BullMQ, lib/workers/sequence-worker.ts).

const CANDIDATE_POOL = 200; // mismo bound que lead-recovery/appointment-reminders
// Un paso bloqueado por la ventana de 24h de Meta (o sin ningún inbound
// todavía) no aborta la inscripción — se reintenta en la próxima hora, igual
// de silencioso que lead-recovery cuando no hay plantilla de reactivación.
const WHATSAPP_WINDOW_RETRY_MINUTES = 60;

function renderStepMessage(message: string, contact: { name: string | null; realName: string | null }): string {
  const displayName = contact.realName ?? contact.name ?? "";
  return message.replace(/\{\{\s*nombre\s*\}\}/gi, displayName);
}

// Llamado justo después de que ocurre un trigger real (se agregó un tag,
// Contact.leadStatus cambió, una WAAppointment pasó a COMPLETED) — busca
// WASequence activas que matcheen y, si el contacto no está ya inscrito,
// crea la WASequenceEnrollment con el primer paso programado.
export async function enrollContactInTrigger(
  triggerType: SequenceTriggerType,
  triggerValue: string | null,
  contactId: string
): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      accountId: true,
      channelAccountId: true,
      chat: { select: { id: true } },
      conversation: { select: { id: true } },
    },
  });
  if (!contact) return;
  // Sin chat/conversación todavía (p. ej. lead de Instant Form que nunca
  // escribió) — no hay ventana de servicio de Meta que evaluar ni forma
  // segura de mandar un primer mensaje proactivo. Fuera del alcance de esta
  // primera versión, mismo criterio que lead-recovery excluye leads sin
  // ningún inbound.
  if (!contact.chat && !contact.conversation) return;

  const scopeFilter = contact.accountId
    ? { waAccountId: contact.accountId }
    : { channelAccountId: contact.channelAccountId! };

  const sequences = await prisma.wASequence.findMany({
    where: {
      ...scopeFilter,
      active: true,
      triggerType,
      // APPOINTMENT_COMPLETED no lleva triggerValue (siempre null) — para
      // los otros dos triggers, tiene que matchear exacto.
      ...(triggerType === "APPOINTMENT_COMPLETED" ? {} : { triggerValue }),
    },
    include: { steps: { orderBy: { order: "asc" }, take: 1 } },
  });

  for (const sequence of sequences) {
    if (sequence.steps.length === 0) continue; // secuencia sin pasos, nada que correr
    try {
      await prisma.wASequenceEnrollment.create({
        data: {
          sequenceId: sequence.id,
          contactId,
          nextRunAt: new Date(Date.now() + sequence.steps[0].delayMinutes * 60_000),
        },
      });
    } catch (err) {
      // @@unique([sequenceId, contactId]) — ya estaba inscrito (de este mismo
      // trigger o de un run anterior), no es un error real que propagar.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
}

type EnrollmentWithRelations = Prisma.WASequenceEnrollmentGetPayload<{
  include: {
    sequence: { include: { steps: true; waAccount: true; channelAccount: true } };
    contact: { include: { chat: true; conversation: true } };
  };
}>;

async function processSingleEnrollment(enrollment: EnrollmentWithRelations, now: Date): Promise<void> {
  const { sequence, contact } = enrollment;

  if (!sequence.active) {
    await prisma.wASequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "CANCELLED", nextRunAt: null },
    });
    return;
  }

  const steps = sequence.steps.sort((a, b) => a.order - b.order);
  const step = steps[enrollment.currentStep];
  if (!step) {
    await prisma.wASequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "COMPLETED", nextRunAt: null },
    });
    return;
  }

  const isWhatsapp = sequence.waAccountId !== null;
  const chatId = contact.chat?.id ?? null;
  const conversationId = contact.conversation?.id ?? null;
  if ((isWhatsapp && !chatId) || (!isWhatsapp && !conversationId)) {
    // El chat/conversación se borró después de la inscripción — nada seguro
    // que hacer, se cancela en vez de reintentar indefinidamente.
    await prisma.wASequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "CANCELLED", nextRunAt: null },
    });
    return;
  }

  const lastInbound = isWhatsapp
    ? await prisma.wAMessage.findFirst({
        where: { chatId: chatId!, direction: "INBOUND" },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      })
    : await prisma.channelMessage.findFirst({
        where: { conversationId: conversationId!, direction: "INBOUND" },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      });

  // Salida temprana por respuesta: si el contacto escribió después del
  // último paso mandado (o después de inscribirse, si no se mandó ninguno
  // todavía), se detiene la secuencia en vez de seguir con el guion.
  const sinceRef = enrollment.lastStepSentAt ?? enrollment.enrolledAt;
  if (sequence.exitOnReply && lastInbound && lastInbound.timestamp > sinceRef) {
    await prisma.wASequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "EXITED_REPLY", nextRunAt: null },
    });
    return;
  }

  // Ventana de servicio de 24h de Meta — solo aplica a WhatsApp (Telegram no
  // impone esta restricción, ver AGENTS.md "Lead recovery"). Sin ningún
  // inbound registrado, o fuera de la ventana, no hay forma de mandar texto
  // libre sin violar la política — se reintenta más tarde en vez de forzar
  // el envío o abortar la inscripción completa.
  if (isWhatsapp && (!lastInbound || !isWithinServiceWindow(lastInbound.timestamp, now))) {
    console.warn(
      `[sequences] Paso ${step.order} de "${sequence.name}" bloqueado por la ventana de 24h de Meta (inscripción ${enrollment.id}) — reintenta en ${WHATSAPP_WINDOW_RETRY_MINUTES} min`
    );
    await prisma.wASequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { nextRunAt: new Date(now.getTime() + WHATSAPP_WINDOW_RETRY_MINUTES * 60_000) },
    });
    return;
  }

  const body = renderStepMessage(step.message, contact);

  if (isWhatsapp) {
    const waAccount = sequence.waAccount!;
    const sendResult = await sendWhatsAppMessage(waAccount, { to: contact.remoteJid, type: "text", body });
    const message = await prisma.wAMessage.create({
      data: {
        wamid: sendResult.wamid ?? undefined,
        chatId: chatId!,
        direction: "OUTBOUND",
        messageType: "text",
        body,
        status: "sent",
        timestamp: now,
      },
    });
    await prisma.wAChat.update({
      where: { id: chatId! },
      data: { lastMessage: body.slice(0, 500), lastMessageAt: now },
    });
    void message;
  } else {
    const channelAccount = sequence.channelAccount!;
    const sendResult = await sendTelegramMessage(channelAccount, { to: contact.remoteJid, body });
    await prisma.channelMessage.create({
      data: {
        externalMessageId: sendResult.externalMessageId,
        conversationId: conversationId!,
        direction: "OUTBOUND",
        messageType: "text",
        body,
        status: "sent",
        timestamp: now,
      },
    });
    await prisma.conversation.update({
      where: { id: conversationId! },
      data: { lastMessage: body.slice(0, 500), lastMessageAt: now },
    });
  }

  const nextStep = steps[enrollment.currentStep + 1];
  await prisma.wASequenceEnrollment.update({
    where: { id: enrollment.id },
    data: nextStep
      ? {
          currentStep: enrollment.currentStep + 1,
          lastStepSentAt: now,
          nextRunAt: new Date(now.getTime() + nextStep.delayMinutes * 60_000),
        }
      : { currentStep: enrollment.currentStep + 1, lastStepSentAt: now, status: "COMPLETED", nextRunAt: null },
  });
}

// Tick de BullMQ (lib/workers/sequence-worker.ts) — procesa las inscripciones
// ACTIVE cuyo nextRunAt ya venció, acotado a CANDIDATE_POOL por corrida. Cada
// inscripción se procesa en su propio try/catch para que un envío fallido no
// tumbe el resto del lote (mismo patrón que lead-recovery-worker.ts).
export async function processSequenceTick(): Promise<void> {
  const now = new Date();
  const enrollments = await prisma.wASequenceEnrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now } },
    take: CANDIDATE_POOL,
    include: {
      sequence: { include: { steps: true, waAccount: true, channelAccount: true } },
      contact: { include: { chat: true, conversation: true } },
    },
  });

  for (const enrollment of enrollments) {
    try {
      await processSingleEnrollment(enrollment, now);
    } catch (err) {
      console.error(`[sequences] Error procesando inscripción ${enrollment.id}:`, err);
    }
  }
}
