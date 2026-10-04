import { INBOUND_TRIGGERS, type TriggerType } from "./types";

// Ajustes por automatización (Automation.settings, JSON).
export interface AutomationSettings {
  // Si el contacto escribe mientras la ejecución está en una espera de tiempo
  // (drip), la ejecución sale (EXITED_REPLY) — mismo criterio que
  // WASequence.exitOnReply. No aplica a "esperar respuesta": ahí responder es
  // justo lo esperado.
  exitOnReply: boolean;
  // ¿Puede volver a correr para un contacto que ya la completó? Nunca corren
  // dos a la vez para el mismo contacto.
  allowReentry: boolean;
}

export function defaultSettings(trigger: TriggerType): AutomationSettings {
  const inbound = INBOUND_TRIGGERS.includes(trigger) || trigger === "manual";
  return { exitOnReply: true, allowReentry: inbound };
}

export function parseSettings(raw: unknown, trigger: TriggerType): AutomationSettings {
  const defaults = defaultSettings(trigger);
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    exitOnReply: typeof obj.exitOnReply === "boolean" ? obj.exitOnReply : defaults.exitOnReply,
    allowReentry: typeof obj.allowReentry === "boolean" ? obj.allowReentry : defaults.allowReentry,
  };
}
