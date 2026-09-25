import type { Step, StepType, Trigger, TriggerType } from "./types";

// Textos de la UI para disparadores y pasos — compartidos por el editor, la
// lista y el chip del inbox. Sin dependencias de servidor.

export type StepGroup = "Mensajes" | "Esperas" | "Lógica" | "CRM" | "IA" | "Salida";

export const STEP_META: Record<StepType, { label: string; description: string; group: StepGroup }> = {
  send_text: { label: "Enviar mensaje", description: "Texto con variables como {{nombre}}", group: "Mensajes" },
  send_buttons: { label: "Enviar botones", description: "Hasta 3 opciones; cada una abre una rama", group: "Mensajes" },
  send_list: { label: "Enviar lista", description: "Hasta 10 opciones en un menú desplegable", group: "Mensajes" },
  send_template: { label: "Enviar plantilla", description: "Plantilla aprobada de WhatsApp (fuera de las 24 h)", group: "Mensajes" },
  wait: { label: "Esperar", description: "Pausa de minutos, horas o días", group: "Esperas" },
  wait_for_reply: { label: "Esperar respuesta", description: "Guarda lo que responda el cliente", group: "Esperas" },
  condition: { label: "Condición", description: "Sí / No según etiquetas, etapa, campos u horario", group: "Lógica" },
  add_tag: { label: "Agregar etiqueta", description: "Etiqueta el contacto", group: "CRM" },
  remove_tag: { label: "Quitar etiqueta", description: "Quita una etiqueta del contacto", group: "CRM" },
  set_lead_status: { label: "Cambiar etapa", description: "Mueve el lead en el Pipeline", group: "CRM" },
  set_custom_field: { label: "Guardar campo", description: "Escribe un campo personalizado", group: "CRM" },
  assign: { label: "Asignar", description: "A una persona o por autoasignación", group: "CRM" },
  notify_team: { label: "Avisar al equipo", description: "Notificación en la campana", group: "CRM" },
  ai_classify: { label: "Clasificar con IA", description: "La IA elige la rama según lo que pide el cliente", group: "IA" },
  ai_extract: { label: "Extraer dato con IA", description: "Saca un dato (fecha, presupuesto…) de la conversación", group: "IA" },
  score_lead: { label: "Calificar lead", description: "Corre un calificador IA", group: "IA" },
  ai_reply: { label: "Pasar al bot IA", description: "El bot de la cuenta sigue la conversación", group: "Salida" },
  webhook: { label: "Llamar webhook", description: "POST/GET a tu sistema; la respuesta queda en variables", group: "Salida" },
  handoff: { label: "Pasar a humano", description: "Avisa al equipo y el bot deja de responder", group: "Salida" },
  end: { label: "Terminar", description: "Fin de la automatización", group: "Salida" },
};

export const TRIGGER_META: Record<TriggerType, { label: string; description: string }> = {
  keyword: { label: "Palabra clave", description: "El cliente escribe una palabra o frase" },
  first_message: { label: "Primer mensaje", description: "Alguien escribe por primera vez" },
  message_received: { label: "Cualquier mensaje", description: "Cada mensaje entrante (si ninguna otra lo tomó)" },
  tag_added: { label: "Etiqueta agregada", description: "Se agrega una etiqueta al contacto o chat" },
  lead_status_changed: { label: "Cambio de etapa", description: "El lead pasa a una etapa del Pipeline" },
  appointment_completed: { label: "Cita completada", description: "Una cita se marca como completada" },
  score_label: { label: "Calificación IA", description: "Un calificador asigna cierta calificación" },
  ad_lead: { label: "Lead de anuncio", description: "Llega un lead de un anuncio de Meta" },
  manual: { label: "Manual", description: "Se inicia desde el chat o por la API" },
};

export const LEAD_STATUS_LABEL: Record<string, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  QUALIFIED: "Calificado",
  CUSTOMER: "Cliente",
  LOST: "Perdido",
};

function clip(text: string, max = 48): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function stepLabel(step: Step): string {
  const base = STEP_META[step.type].label;
  switch (step.type) {
    case "send_text":
    case "send_buttons":
    case "send_list":
      return `${base}: ${clip(step.config.text)}`;
    case "wait":
      return `${base} ${formatDuration(step.config.minutes)}`;
    case "add_tag":
    case "remove_tag":
      return `${base}: ${step.config.tagName}`;
    case "set_lead_status":
      return `${base}: ${LEAD_STATUS_LABEL[step.config.status] ?? step.config.status}`;
    default:
      return base;
  }
}

export function triggerSummary(trigger: Trigger): string {
  switch (trigger.type) {
    case "keyword":
      return `Palabra clave: ${trigger.keywords.filter(Boolean).join(", ") || "—"}`;
    case "tag_added":
      return `Etiqueta: ${trigger.tagName || "—"}`;
    case "lead_status_changed":
      return `Pasa a ${LEAD_STATUS_LABEL[trigger.status] ?? trigger.status}`;
    case "score_label":
      return `Calificación: ${trigger.label || "—"}`;
    case "ad_lead":
      return trigger.origin === "ANY" ? "Lead de cualquier anuncio" : trigger.origin === "CTWA" ? "Lead de anuncio a WhatsApp" : "Lead de formulario instantáneo";
    default:
      return TRIGGER_META[trigger.type].label;
  }
}

export function formatDuration(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} día${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}
