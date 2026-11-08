// Reglas puras de la salud de WhatsApp (lib/platform/support.ts), con tests.

export type WhatsAppVerdict = "ok" | "limited" | "blocked" | "unknown";

export interface MetaHealthEntity {
  entity_type?: string;
  can_send_message?: string;
  errors?: Array<{ error_code?: number; error_description?: string; possible_solution?: string }>;
  additional_info?: string[];
}

// `status` del número en Graph. FLAGGED/RATE_LIMITED siguen enviando con
// límites; el resto de los no conectados no envía.
const LIMITED_NUMBER_STATUS = new Set(["FLAGGED", "RATE_LIMITED"]);
const OK_NUMBER_STATUS = new Set(["CONNECTED", "MIGRATED"]);
// Nombres que no frenan el envío.
const OK_NAME_STATUS = new Set(["APPROVED", "AVAILABLE_WITHOUT_REVIEW"]);

// Pura: resume lo que Meta dice en un veredicto para el operador.
export function whatsappVerdict(info: { canSendMessage: string | null; nameStatus: string | null; numberStatus: string | null } | null): WhatsAppVerdict {
  if (!info) return "unknown";
  const number = info.numberStatus;
  if (info.canSendMessage === "BLOCKED" || (number && !OK_NUMBER_STATUS.has(number) && !LIMITED_NUMBER_STATUS.has(number))) return "blocked";
  if (info.canSendMessage === "LIMITED" || (number && LIMITED_NUMBER_STATUS.has(number)) || (info.nameStatus && !OK_NAME_STATUS.has(info.nameStatus))) return "limited";
  if (info.canSendMessage === "AVAILABLE") return "ok";
  return "unknown";
}

const SIP_ERRORS = new Set([138024, 138025]);

// Textos de Meta (en inglés) → español para el operador. Solo lo conocido: un
// valor o código que no esté aquí se muestra tal como llega, sin inventar.
const CAN_SEND_LABEL: Record<string, string> = { AVAILABLE: "puede enviar", LIMITED: "limitado", BLOCKED: "bloqueado" };
const NAME_STATUS_LABEL: Record<string, string> = {
  APPROVED: "aprobado",
  AVAILABLE_WITHOUT_REVIEW: "disponible sin revisión",
  PENDING_REVIEW: "en revisión",
  DECLINED: "rechazado",
  EXPIRED: "vencido",
  NONE: "sin nombre",
};
const QUALITY_LABEL: Record<string, string> = { GREEN: "alta", YELLOW: "media", RED: "baja", UNKNOWN: "sin dato" };
const LIMIT_LABEL: Record<string, string> = {
  TIER_50: "50 clientes / 24 h",
  TIER_250: "250 clientes / 24 h",
  TIER_1K: "1,000 clientes / 24 h",
  TIER_10K: "10,000 clientes / 24 h",
  TIER_100K: "100,000 clientes / 24 h",
  TIER_UNLIMITED: "sin límite",
};
const ENTITY_LABEL: Record<string, string> = {
  PHONE_NUMBER: "Número",
  WABA: "Cuenta de WhatsApp Business",
  BUSINESS: "Negocio",
  APP: "App",
  AD_ACCOUNT: "Cuenta de anuncios",
};
const ERROR_TEXT: Record<number, { description: string; solution?: string }> = {
  141006: {
    description: "Hay un problema con el método de pago. Esto bloquea las conversaciones iniciadas por el negocio.",
    solution: "Agrega un método de pago nuevo a la cuenta en el Administrador de WhatsApp.",
  },
  141010: {
    description: "El negocio no ha pasado la verificación de negocio.",
    solution: "Entra a la configuración del negocio en Meta e inicia o resuelve la solicitud de verificación.",
  },
};
const INFO_TEXT: Array<[RegExp, string]> = [
  [
    /^Your display name has not been approved yet\.?(?: Your message limit will increase after the display name is approved\.?)?$/i,
    "Meta todavía no aprueba el nombre para mostrar. El límite de mensajes aumentará cuando lo apruebe.",
  ],
];

function labelOf(table: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "—";
  return table[value] ?? value;
}

export const canSendLabel = (value: string | null | undefined) => labelOf(CAN_SEND_LABEL, value);
export const nameStatusLabel = (value: string | null | undefined) => labelOf(NAME_STATUS_LABEL, value);
export const qualityLabel = (value: string | null | undefined) => labelOf(QUALITY_LABEL, value);
export const messagingLimitLabel = (value: string | null | undefined) => labelOf(LIMIT_LABEL, value);

/**
 * Evento `phone_number_quality_update` de Meta que amerita avisar. Antes era
 * `/flag|downgrade|red|yellow/i`, que también coincidía con UNFLAGGED (la
 * calidad se recuperó) y mandaba "la calidad bajó" justo al revés.
 */
export function isNegativeQualityEvent(event: string | null | undefined): boolean {
  if (!event) return false;
  return ["FLAGGED", "DOWNGRADE"].includes(event.toUpperCase()) || /^(RED|YELLOW)$/i.test(event);
}

const QUALITY_EVENT_TEXT: Record<string, string> = {
  FLAGGED: "Meta marcó el número por baja calidad: si sigue así, bajará su límite de envío.",
  DOWNGRADE: "Meta bajó el límite de envío del número por su calidad.",
  RED: "La calidad del número es baja.",
  YELLOW: "La calidad del número es media.",
};

/** Texto del aviso para la persona, sin códigos de Meta. */
export function qualityEventText(event: string, tier: string | null | undefined): string {
  const text = QUALITY_EVENT_TEXT[event.toUpperCase()] ?? "Meta reportó un cambio en la calidad del número.";
  return tier ? `${text} Límite actual: ${messagingLimitLabel(tier)}.` : text;
}

function translateInfo(info: string): string {
  return INFO_TEXT.find(([pattern]) => pattern.test(info.trim()))?.[1] ?? info;
}

export function noticesFrom(entities: MetaHealthEntity[] | undefined): string[] {
  const out: string[] = [];
  for (const entity of entities ?? []) {
    const who = labelOf(ENTITY_LABEL, entity.entity_type ?? "?");
    for (const info of entity.additional_info ?? []) out.push(`${who}: ${translateInfo(info)}`);
    for (const error of entity.errors ?? []) {
      if (error.error_code && SIP_ERRORS.has(error.error_code)) continue;
      const known = error.error_code ? ERROR_TEXT[error.error_code] : undefined;
      const description = known?.description ?? error.error_description ?? "";
      const solution = known ? known.solution : error.possible_solution;
      out.push(`${who}: (#${error.error_code ?? "?"}) ${description}${solution ? ` → ${solution}` : ""}`.trim());
    }
  }
  return out;
}
