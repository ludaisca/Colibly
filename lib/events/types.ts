import type { Channel, LeadOrigin, LeadStatus, WAAppointmentStatus } from "@prisma/client";
import type { OutboundOrigin, SentBy } from "@/lib/messages/origin";

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
  // `source` es el campo original (3 valores); `origin` dice exactamente qué
  // parte de Colibly lo mandó (lib/messages/origin.ts) y `sentBy`, quién.
  "message.sent": {
    messageId: string;
    messageType: string;
    text: string | null;
    source: MessageSource;
    senderId: string | null;
    origin: OutboundOrigin;
    sentBy: SentBy;
    senderName: string | null;
  };
  // Solo WhatsApp: Meta confirma la entrega, la lectura o el fallo de un saliente.
  "message.status_changed": {
    messageId: string;
    status: string; // sent | delivered | read | failed
    previousStatus: string | null;
    // message = texto en español; title/details/href = los de Meta tal cual.
    error: { code: number | null; message: string; title: string | null; details: string | null; href: string | null } | null;
    // Modelo por mensaje de Meta: si se cobra y en qué categoría.
    pricing: { billable: boolean | null; model: string | null; category: string | null; type: string | null } | null;
  };
  // El mensaje cambió después de guardarse: su medio quedó listo para bajar
  // (media_ready) o un media_placeholder del historial recibió su contenido
  // (history_media). El mensaje fresco viaja en `message` del sobre.
  "message.updated": { messageId: string; reason: "media_ready" | "history_media" };
  // history = importación del historial de la app WhatsApp Business
  // (coexistencia); echo = el negocio escribió primero desde esa app.
  "contact.created": { origin: LeadOrigin; source: "inbound" | "api" | "lead_ads" | "history" | "echo" | "import" };
  "contact.lead_status_changed": { from: LeadStatus; to: LeadStatus };
  // El cliente pidió dejar de recibir (o volver a recibir) marketing desde
  // WhatsApp (botón nativo de Meta, campo user_preferences).
  "contact.marketing_preference_changed": { optedOut: boolean; source: "whatsapp" };
  "tag.added": { tagId: string; tagName: string; target: "contact" | "conversation" };
  "conversation.assigned": { assignedToId: string | null; auto: boolean };
  "conversation.resolved": Record<string, never>;
  "appointment.created": { appointmentId: string; title: string; scheduledAt: string; source: "MANUAL" | "AI_BOT" | "API" };
  "appointment.status_changed": { appointmentId: string; from: WAAppointmentStatus; to: WAAppointmentStatus };
  "lead.scored": { scorerId: string; scorerName: string; score: number; label: string; previousLabel: string | null };
  "lead.ad_captured": { origin: Exclude<LeadOrigin, "ORGANIC">; adId: string | null };
  // Eventos de la cuenta de WhatsApp (sin contacto ni conversación). Las
  // plantillas son de la WABA: con varios números bajo la misma WABA llega uno
  // por cuenta, cada uno con su templateId de Colibly.
  "template.status_changed": {
    templateId: string;
    name: string;
    language: string;
    event: string; // el de Meta: APPROVED, REJECTED, PAUSED, FLAGGED, REINSTATED…
    status: string;
    previousStatus: string;
    reason: string | null;
  };
  "template.category_changed": { templateId: string; name: string; language: string; category: string; previousCategory: string };
  "account.quality_changed": { event: string | null; messagingTier: string | null };
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
  "message.sent": "Mensaje enviado: bandeja, API, automatización, bot, campaña, secuencia, aviso automático o la app WhatsApp Business",
  "message.status_changed": "Estado de un mensaje enviado (entregado, leído o fallido). Solo WhatsApp",
  "message.updated": "Un mensaje ya guardado cambió: su medio quedó listo o llegó el contenido de un media_placeholder",
  "contact.created": "Contacto nuevo",
  "contact.lead_status_changed": "Cambio de etapa del lead",
  "contact.marketing_preference_changed": "El contacto pidió dejar de recibir marketing, o volver a recibirlo, desde WhatsApp",
  "tag.added": "Etiqueta agregada a un contacto o conversación",
  "conversation.assigned": "Conversación asignada",
  "conversation.resolved": "Conversación resuelta",
  "appointment.created": "Cita creada",
  "appointment.status_changed": "Cambio de estado de una cita",
  "lead.scored": "Lead calificado por un calificador IA",
  "lead.ad_captured": "Lead llegado de un anuncio (CTWA o Instant Form)",
  "template.status_changed": "Meta revisó, pausó, desactivó o marcó una plantilla. Solo WhatsApp",
  "template.category_changed": "Meta cambió la categoría de una plantilla. Solo WhatsApp",
  "account.quality_changed": "Cambió la calidad o el límite de envío del número. Solo WhatsApp",
};

export const DOMAIN_EVENT_TYPES = Object.keys(DOMAIN_EVENT_CATALOG) as DomainEventType[];
