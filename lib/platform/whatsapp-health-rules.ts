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

export function noticesFrom(entities: MetaHealthEntity[] | undefined): string[] {
  const out: string[] = [];
  for (const entity of entities ?? []) {
    const who = entity.entity_type ?? "?";
    for (const info of entity.additional_info ?? []) out.push(`${who}: ${info}`);
    for (const error of entity.errors ?? []) {
      if (error.error_code && SIP_ERRORS.has(error.error_code)) continue;
      out.push(`${who}: (#${error.error_code ?? "?"}) ${error.error_description ?? ""}${error.possible_solution ? ` → ${error.possible_solution}` : ""}`.trim());
    }
  }
  return out;
}

