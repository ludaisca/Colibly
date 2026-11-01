import { Prisma, type LeadStatus, type WAAppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DomainEvent } from "@/lib/events/types";

export const CONTACT_ACTIVITY_TYPES = [
  "CONTACT_CREATED",
  "LEAD_STATUS_CHANGED",
  "TAG_ADDED",
  "CONVERSATION_ASSIGNED",
  "CONVERSATION_RESOLVED",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_STATUS_CHANGED",
  "LEAD_SCORED",
  "LEAD_AD_CAPTURED",
  "NOTE_ADDED",
  "TASK_CREATED",
  "TASK_COMPLETED",
  "TASK_REOPENED",
  "TASK_DELETED",
  "CUSTOM_FIELDS_UPDATED",
  "DEAL_UPDATED",
] as const;

export type ContactActivityType = (typeof CONTACT_ACTIVITY_TYPES)[number];

const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  QUALIFIED: "Calificado",
  CUSTOMER: "Cliente",
  LOST: "Perdido",
};

const APPOINTMENT_STATUS_LABEL: Record<WAAppointmentStatus, string> = {
  SCHEDULED: "Agendada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No asistió",
};

interface ActivityInput {
  contactId: string;
  type: ContactActivityType;
  title: string;
  body?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Nunca lanza: la acción de negocio ya ocurrió. Un timeline incompleto es
// preferible a un 500 en la ruta que acaba de guardar la nota/tarea.
export async function recordContactActivity(input: ActivityInput): Promise<void> {
  try {
    await prisma.contactActivity.create({
      data: {
        contactId: input.contactId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 2000) ?? null,
        actorId: input.actorId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        dedupeKey: input.dedupeKey ?? null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return;
    console.error("[contacts/activity] no se pudo registrar la actividad", error);
  }
}

type MappedActivity = Omit<ActivityInput, "contactId" | "dedupeKey"> | null;

async function activityForEvent(event: DomainEvent): Promise<MappedActivity> {
  switch (event.type) {
    case "contact.created":
      return {
        type: "CONTACT_CREATED",
        title: "Contacto creado",
        body: event.data.source ? `Origen: ${event.data.source}` : null,
        metadata: event.data,
      };
    case "contact.lead_status_changed":
      return {
        type: "LEAD_STATUS_CHANGED",
        title: "Etapa del lead actualizada",
        body: `${LEAD_STATUS_LABEL[event.data.from]} → ${LEAD_STATUS_LABEL[event.data.to]}`,
        metadata: event.data,
      };
    case "tag.added":
      return {
        type: "TAG_ADDED",
        title: `Etiqueta "${event.data.tagName}" agregada`,
        body: event.data.target === "conversation" ? "A la conversación" : "Al contacto",
        metadata: event.data,
      };
    case "conversation.assigned": {
      let assignedName: string | null = null;
      if (event.data.assignedToId) {
        assignedName = (await prisma.user.findUnique({
          where: { id: event.data.assignedToId },
          select: { name: true },
        }))?.name ?? null;
      }
      return {
        type: "CONVERSATION_ASSIGNED",
        title: event.data.assignedToId ? "Conversación asignada" : "Conversación sin asignar",
        body: assignedName ? `A ${assignedName}` : event.data.assignedToId ? "A un agente" : null,
        metadata: event.data,
      };
    }
    case "conversation.resolved":
      return {
        type: "CONVERSATION_RESOLVED",
        title: "Conversación resuelta",
        metadata: event.data,
      };
    case "appointment.created":
      return {
        type: "APPOINTMENT_CREATED",
        title: `Cita: ${event.data.title}`,
        body: new Date(event.data.scheduledAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }),
        metadata: event.data,
      };
    case "appointment.status_changed":
      return {
        type: "APPOINTMENT_STATUS_CHANGED",
        title: "Estado de la cita actualizado",
        body: `${APPOINTMENT_STATUS_LABEL[event.data.from]} → ${APPOINTMENT_STATUS_LABEL[event.data.to]}`,
        metadata: event.data,
      };
    case "lead.scored":
      return {
        type: "LEAD_SCORED",
        title: `Lead calificado: ${event.data.label}`,
        body: `${event.data.score}/100 · ${event.data.scorerName}`,
        metadata: event.data,
      };
    case "lead.ad_captured":
      return {
        type: "LEAD_AD_CAPTURED",
        title: "Lead capturado de un anuncio",
        body: `Origen: ${event.data.origin}${event.data.adId ? ` · ${event.data.adId}` : ""}`,
        metadata: event.data,
      };
    // Un timeline con cada mensaje sería el propio hilo de chat. Se omite.
    case "message.received":
    case "message.sent":
      return null;
    default:
      return null;
  }
}

export async function recordContactActivityFromEvent(event: DomainEvent): Promise<void> {
  if (!event.contactId) return;
  try {
    const mapped = await activityForEvent(event);
    if (!mapped) return;
    await recordContactActivity({
      contactId: event.contactId,
      dedupeKey: event.id,
      ...mapped,
    });
  } catch (error) {
    // El timeline no puede tumbar el fan-out de webhooks ni las
    // automatizaciones del mismo evento.
    console.error("[contacts/activity] no se pudo mapear el evento", event.type, error);
  }
}
