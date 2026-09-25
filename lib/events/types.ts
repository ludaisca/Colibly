import type { Channel, LeadOrigin, LeadStatus, WAAppointmentStatus } from "@prisma/client";

// Eventos de dominio: la única fuente de la que beben los webhooks salientes
// (y, en la fase 2, los disparadores de automatizaciones). Los emite el código
// donde el hecho ocurre (ingest, rutas de contactos/chats/citas, scoring) vía
// lib/events/emit.ts. Viajan por BullMQ, así que todo es serializable a JSON
// (fechas como ISO string).

export type AccountRef = { kind: "whatsapp"; id: string } | { kind: "channel"; id: string; channel: Channel };

// WAChat.id o Conversation.id — el mismo discriminador que AccountRef.
export type ChatRef = { kind: "whatsapp"; id: string } | { kind: "channel"; id: string };

export type MessageSource = "agent" | "api" | "automation";

interface EventDataMap {
  "message.received": { messageId: string; messageType: string; text: string | null; interactiveReplyId: string | null };
  "message.sent": { messageId: string; messageType: string; text: string | null; source: MessageSource; senderId: string | null };
  "contact.created": { origin: LeadOrigin; source: "inbound" | "api" | "lead_ads" };
  "contact.lead_status_changed": { from: LeadStatus; to: LeadStatus };
  "tag.added": { tagId: string; tagName: string; target: "contact" | "conversation" };
  "conversation.assigned": { assignedToId: string | null; auto: boolean };
  "conversation.resolved": Record<string, never>;
  "appointment.created": { appointmentId: string; title: string; scheduledAt: string; source: "MANUAL" | "AI_BOT" | "API" };
  "appointment.status_changed": { appointmentId: string; from: WAAppointmentStatus; to: WAAppointmentStatus };
  "lead.scored": { scorerId: string; scorerName: string; score: number; label: string; previousLabel: string | null };
  "lead.ad_captured": { origin: Exclude<LeadOrigin, "ORGANIC">; adId: string | null };
}

export type DomainEventType = keyof EventDataMap;

export type DomainEventInput = {
  [T in DomainEventType]: {
    type: T;
    account: AccountRef;
    contactId: string | null;
    chat: ChatRef | null;
    data: EventDataMap[T];
  };
}[DomainEventType];

// Lo que viaja por la cola: la entrada + identidad y hora del hecho.
export type DomainEvent = DomainEventInput & { id: string; occurredAt: string };

// Catálogo público (API, UI de webhooks, OpenAPI). "webhook.test" solo lo
// genera el botón "Enviar evento de prueba".
export const DOMAIN_EVENT_CATALOG: Record<DomainEventType, string> = {
  "message.received": "Mensaje recibido de un contacto",
  "message.sent": "Mensaje enviado por un agente, la API o una automatización",
  "contact.created": "Contacto nuevo",
  "contact.lead_status_changed": "Cambio de etapa del lead",
  "tag.added": "Etiqueta agregada a un contacto o conversación",
  "conversation.assigned": "Conversación asignada",
  "conversation.resolved": "Conversación resuelta",
  "appointment.created": "Cita creada",
  "appointment.status_changed": "Cambio de estado de una cita",
  "lead.scored": "Lead calificado por un calificador IA",
  "lead.ad_captured": "Lead llegado de un anuncio (CTWA o Instant Form)",
};

export const DOMAIN_EVENT_TYPES = Object.keys(DOMAIN_EVENT_CATALOG) as DomainEventType[];
