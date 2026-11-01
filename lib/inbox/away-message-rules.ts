// Reglas puras del aviso fuera de horario (sin Prisma).

/** Como mucho un aviso por chat cada 12 h. */
export const AWAY_COOLDOWN_HOURS = 12;
/** Mismo debounce que el bot: agrupa ráfagas de mensajes en un solo aviso. */
export const AWAY_DEBOUNCE_MS = 4_000;
export const AWAY_MESSAGE_MAX_LENGTH = 1000;

export interface AwayDecisionInput {
  enabled: boolean;
  text: string | null;
  inBusinessHours: boolean;
  lastSentAt: Date | null;
  now: Date;
  isGroup: boolean;
  isFromComment: boolean;
  /** Un bot activo o una automatización que tomó el chat ya contestan. */
  handledByBotOrFlow: boolean;
}

export type AwaySkipReason =
  | "disabled"
  | "no_text"
  | "in_hours"
  | "cooldown"
  | "group"
  | "comment"
  | "bot_or_flow";

/** null = mandar; si no, el motivo por el que no se manda. */
export function awaySkipReason(input: AwayDecisionInput): AwaySkipReason | null {
  if (!input.enabled) return "disabled";
  if (!input.text || !input.text.trim()) return "no_text";
  if (input.isGroup) return "group";
  // Un comentario de Facebook solo admite Private Reply, y esa es decisión
  // del agente (ver canales.md → Comment-to-inbox).
  if (input.isFromComment) return "comment";
  if (input.handledByBotOrFlow) return "bot_or_flow";
  if (input.inBusinessHours) return "in_hours";
  if (input.lastSentAt && input.now.getTime() - input.lastSentAt.getTime() < AWAY_COOLDOWN_HOURS * 3_600_000) {
    return "cooldown";
  }
  return null;
}

/** Límite inferior para el claim atómico: un aviso anterior a esto ya no bloquea. */
export function awayCooldownFloor(now: Date): Date {
  return new Date(now.getTime() - AWAY_COOLDOWN_HOURS * 3_600_000);
}
