// De dónde salió un mensaje y quién lo mandó, en la forma pública (API y
// webhooks). Se guarda al crear el saliente en `sentVia` (WAMessage y
// ChannelMessage); para filas anteriores a esa columna se deduce de lo que ya
// había (origin de Meta, senderId, campaña, fuente de leads, recuperación).

export const OUTBOUND_ORIGINS = [
  "agent", // bandeja (una persona de Colibly)
  "api", // API pública
  "automation", // automatizaciones, macros, fuentes de leads
  "bot", // bot IA
  "campaign", // campaña masiva
  "sequence", // secuencia
  "recovery", // recuperación de leads
  "system", // avisos automáticos: fuera de horario, auto-resolver, CSAT, permiso de llamada
  "business_app", // escrito en la app WhatsApp Business del teléfono (Coexistencia)
  "history", // importado del historial de la app WhatsApp Business
] as const;

export type OutboundOrigin = (typeof OUTBOUND_ORIGINS)[number];

// Entrantes: "contact" (en vivo) o "history" (importado).
export type MessageOrigin = OutboundOrigin | "contact";

export type SentBy = "contact" | "user" | "bot" | "business_app" | "system";

export function isOutboundOrigin(v: unknown): v is OutboundOrigin {
  return typeof v === "string" && (OUTBOUND_ORIGINS as readonly string[]).includes(v);
}

export interface OriginInput {
  direction: string;
  sentVia?: string | null;
  // WAMessage.origin (API | BUSINESS_APP_ECHO | HISTORY)
  origin?: string | null;
  senderId?: string | null;
  campaignId?: string | null;
  leadSheetSourceId?: string | null;
  recoveryAttempt?: unknown;
}

export function messageOrigin(m: OriginInput): MessageOrigin | null {
  if (m.origin === "HISTORY") return "history";
  if (m.direction !== "OUTBOUND") return "contact";
  if (isOutboundOrigin(m.sentVia)) return m.sentVia;
  if (m.origin === "BUSINESS_APP_ECHO") return "business_app";
  if (m.campaignId) return "campaign";
  if (m.recoveryAttempt) return "recovery";
  if (m.leadSheetSourceId) return "automation";
  if (m.senderId) return "agent";
  // Saliente anterior a `sentVia` sin más pistas: no se inventa.
  return null;
}

export function sentByOf(origin: MessageOrigin | null, direction: string, senderId?: string | null): SentBy | null {
  if (direction !== "OUTBOUND") return "contact";
  switch (origin) {
    case "agent":
      return "user";
    case "bot":
      return "bot";
    case "business_app":
    case "history":
      return "business_app";
    case null:
      return senderId ? "user" : null;
    default:
      // api, automation, campaign, sequence, recovery, system: lo mandó
      // Colibly sin una persona detrás (aunque un usuario lo haya programado).
      return senderId ? "user" : "system";
  }
}

// `source` de message.sent es anterior a `origin` y solo admite tres valores;
// se conserva para no romper integraciones que ya ramifican por él.
export function legacySourceOf(origin: OutboundOrigin): "agent" | "api" | "automation" {
  if (origin === "agent" || origin === "business_app" || origin === "history") return "agent";
  if (origin === "api") return "api";
  return "automation";
}
