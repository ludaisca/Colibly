import { INBOUND_TRIGGERS, isBranching, type Graph, type Step } from "./types";

// Validación pura del grafo: la usan el editor (en el navegador, para marcar
// cada tarjeta) y la ruta de publicar (en el servidor, como autoridad). No
// importa nada de Node.

export type AutomationChannel = "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM" | "WEBCHAT";

export interface ValidationIssue {
  nodeId: string | null; // null = problema del disparador o del grafo entero
  level: "error" | "warning";
  message: string;
}

const MAX_STEPS = 200;
const DAY = 24 * 60;
const WINDOW_MINUTES = DAY;
const MAX_WAIT_MINUTES = 30 * DAY;
const MAX_REPLY_TIMEOUT = 7 * DAY;

// Límites de Meta para mensajes interactivos (los más estrictos de los
// canales; Telegram/Messenger/Web aceptan lo mismo o más).
export const LIMITS = {
  buttons: 3,
  buttonTitle: 20,
  listRows: 10,
  listRowTitle: 24,
  listRowDescription: 72,
  listButtonLabel: 20,
  interactiveBody: 1024,
  text: 4096,
  categories: 10,
} as const;

function requiredBranchKeys(step: Step): string[] | null {
  switch (step.type) {
    case "send_buttons":
    case "send_list":
      return [...step.config.options.map((o) => o.id), "other", "timeout"];
    case "wait_for_reply":
      return ["answered", "timeout"];
    case "condition":
      return ["yes", "no"];
    case "ai_classify":
      return [...step.config.categories.map((c) => c.id), "other"];
    default:
      return null;
  }
}

export function validateGraph(graph: Graph, channel: AutomationChannel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (nodeId: string | null, message: string) => issues.push({ nodeId, level: "error", message });
  const warn = (nodeId: string | null, message: string) => issues.push({ nodeId, level: "warning", message });

  // ── Disparador ──
  const t = graph.trigger;
  if (t.type === "keyword") {
    if (t.keywords.filter((k) => k.trim()).length === 0) err(null, "Agrega al menos una palabra clave");
  }
  if (t.type === "tag_added" && !t.tagName.trim()) err(null, "Elige la etiqueta que dispara la automatización");
  if (t.type === "deal_stage_changed" && !t.stageId) err(null, "Elige la etapa que dispara la automatización");
  if (t.type === "score_label" && !t.label.trim()) err(null, "Elige la calificación que dispara la automatización");

  if (graph.steps.length === 0) err(null, "Agrega al menos un paso");

  // ── Ids únicos (pasos, opciones, ramas, categorías) ──
  const seen = new Set<string>();
  let count = 0;
  const claim = (id: string, nodeId: string) => {
    if (!id) err(nodeId, "Hay un elemento sin id");
    else if (seen.has(id)) err(nodeId, `Id repetido: ${id}`);
    seen.add(id);
  };

  const inboundStart = INBOUND_TRIGGERS.includes(t.type);

  // `sinceInbound`: minutos transcurridos, en el peor caso, desde el último
  // mensaje del cliente al llegar a este punto (null = desconocido: el
  // disparador no fue un mensaje). Sirve para avisar de la ventana de 24 h.
  const walk = (list: Step[], sinceInbound: number | null) => {
    list.forEach((step, index) => {
      count++;
      claim(step.id, step.id);
      const isLast = index === list.length - 1;

      if (isBranching(step) && !isLast) {
        err(step.id, "Un paso con ramas debe ser el último de su columna: lo que sigue va dentro de cada rama");
      }
      if ((step.type === "end" || step.type === "handoff" || step.type === "ai_reply") && !isLast) {
        err(step.id, "Este paso termina la automatización: no puede tener pasos después");
      }

      validateStep(step, channel, err, warn, claim);

      const freeForm = step.type === "send_text" || step.type === "send_buttons" || step.type === "send_list";
      if (channel === "WHATSAPP" && freeForm) {
        const hasFallback = step.type === "send_text" && !!step.config.fallbackTemplateId;
        if (sinceInbound === null && !inboundStart && !hasFallback) {
          warn(step.id, "WhatsApp solo permite mensajes libres dentro de las 24 h posteriores al último mensaje del cliente. Si no escribió hace poco, este mensaje no se enviará: agrega una plantilla de respaldo o empieza con una plantilla.");
        } else if (sinceInbound !== null && sinceInbound >= WINDOW_MINUTES && !hasFallback) {
          warn(step.id, "Llega aquí más de 24 h después del último mensaje del cliente: WhatsApp rechazará un mensaje libre. Usa una plantilla.");
        }
      }

      if (step.type === "wait") {
        sinceInbound = sinceInbound === null ? null : sinceInbound + step.config.minutes;
      }

      if (isBranching(step)) {
        const required = requiredBranchKeys(step) ?? [];
        const keys = step.branches.map((b) => b.key);
        for (const k of required) if (!keys.includes(k)) err(step.id, `Falta la rama "${k}"`);
        for (const k of keys) if (!required.includes(k)) err(step.id, `Rama sobrante "${k}"`);
        for (const branch of step.branches) {
          claim(branch.id, step.id);
          let next = sinceInbound;
          if (branch.key === "timeout" && (step.type === "send_buttons" || step.type === "send_list" || step.type === "wait_for_reply")) {
            next = (sinceInbound ?? 0) + step.config.timeoutMinutes;
          } else if (step.type === "send_buttons" || step.type === "send_list" || step.type === "wait_for_reply") {
            next = 0; // el cliente acaba de responder: ventana reabierta
          }
          walk(branch.steps, next);
        }
      }
    });
  };
  walk(graph.steps, inboundStart ? 0 : null);

  if (count > MAX_STEPS) err(null, `Máximo ${MAX_STEPS} pasos por automatización`);
  return issues;
}

function validateStep(
  step: Step,
  channel: AutomationChannel,
  err: (nodeId: string | null, m: string) => void,
  warn: (nodeId: string | null, m: string) => void,
  claim: (id: string, nodeId: string) => void
) {
  const id = step.id;
  switch (step.type) {
    case "send_text":
      if (!step.config.text.trim()) err(id, "Escribe el mensaje");
      if (step.config.text.length > LIMITS.text) err(id, `Máximo ${LIMITS.text} caracteres`);
      if (step.config.fallbackTemplateId && channel !== "WHATSAPP") err(id, "La plantilla de respaldo solo aplica a WhatsApp");
      break;
    case "send_buttons":
    case "send_list": {
      const isList = step.type === "send_list";
      const max = isList ? LIMITS.listRows : LIMITS.buttons;
      const titleMax = isList ? LIMITS.listRowTitle : LIMITS.buttonTitle;
      if (!step.config.text.trim()) err(id, "Escribe el mensaje que acompaña las opciones");
      if (step.config.text.length > LIMITS.interactiveBody) err(id, `El mensaje admite máximo ${LIMITS.interactiveBody} caracteres`);
      if (step.config.options.length === 0) err(id, "Agrega al menos una opción");
      if (step.config.options.length > max) err(id, `Máximo ${max} opciones`);
      for (const o of step.config.options) {
        claim(o.id, id);
        if (!o.title.trim()) err(id, "Hay una opción sin texto");
        if (o.title.length > titleMax) err(id, `“${o.title}” excede ${titleMax} caracteres`);
        if (isList && (o.description?.length ?? 0) > LIMITS.listRowDescription) {
          err(id, `La descripción de “${o.title}” excede ${LIMITS.listRowDescription} caracteres`);
        }
      }
      const titles = step.config.options.map((o) => o.title.trim().toLowerCase());
      if (new Set(titles).size !== titles.length) err(id, "Dos opciones tienen el mismo texto");
      if (isList && step.type === "send_list") {
        if (!step.config.buttonLabel.trim()) err(id, "Escribe el texto del botón que abre la lista");
        if (step.config.buttonLabel.length > LIMITS.listButtonLabel) err(id, `El botón de la lista admite ${LIMITS.listButtonLabel} caracteres`);
      }
      checkTimeout(id, step.config.timeoutMinutes, err);
      break;
    }
    case "send_template":
      if (channel !== "WHATSAPP") err(id, "Las plantillas solo existen en WhatsApp");
      if (!step.config.templateId) err(id, "Elige una plantilla aprobada");
      break;
    case "wait":
      if (!(step.config.minutes >= 1 && step.config.minutes <= MAX_WAIT_MINUTES)) err(id, "La espera debe ser de 1 minuto a 30 días");
      break;
    case "wait_for_reply":
      checkTimeout(id, step.config.timeoutMinutes, err);
      if (step.config.saveToVar && !/^[a-z0-9_]+$/i.test(step.config.saveToVar)) err(id, "El nombre de variable solo admite letras, números y _");
      break;
    case "condition":
      if (step.config.rules.length === 0) err(id, "Agrega al menos una regla");
      for (const r of step.config.rules) {
        if ((r.subject === "var" || r.subject === "custom_field") && !r.key) err(id, "Una regla no indica qué variable o campo revisar");
        if (!["present", "absent"].includes(r.op) && r.subject !== "business_hours" && (r.value === null || r.value === "")) {
          err(id, "Una regla no tiene valor para comparar");
        }
      }
      break;
    case "add_tag":
    case "remove_tag":
      if (!step.config.tagName.trim()) err(id, "Elige la etiqueta");
      break;
    case "set_custom_field":
      if (!step.config.key) err(id, "Elige el campo personalizado");
      break;
    case "assign":
      if (step.config.mode === "user" && !step.config.userId) err(id, "Elige a quién asignar");
      break;
    case "notify_team":
      if (!step.config.title.trim()) err(id, "Escribe el título del aviso");
      if (step.config.target === "user" && !step.config.userId) err(id, "Elige a quién avisar");
      break;
    case "ai_classify":
      if (step.config.categories.length < 2) err(id, "Define al menos 2 categorías");
      if (step.config.categories.length > LIMITS.categories) err(id, `Máximo ${LIMITS.categories} categorías`);
      for (const c of step.config.categories) {
        claim(c.id, id);
        if (!c.label.trim()) err(id, "Hay una categoría sin nombre");
      }
      break;
    case "ai_extract":
      if (!step.config.what.trim()) err(id, "Describe qué dato extraer");
      if (!step.config.saveToVar && !step.config.saveToCustomField) err(id, "Indica dónde guardar el dato");
      break;
    case "score_lead":
      if (!step.config.scorerId) err(id, "Elige el calificador");
      if (channel !== "WHATSAPP" && channel !== "TELEGRAM") err(id, "La calificación solo está disponible en WhatsApp y Telegram");
      break;
    case "webhook":
      if (!/^https?:\/\/\S+$/i.test(step.config.url)) err(id, "La URL no es válida");
      else if (step.config.url.startsWith("http://")) warn(id, "Usa https:// — en producción http:// se rechaza");
      break;
    case "handoff":
    case "ai_reply":
    case "end":
      break;
    case "set_deal_stage":
      if (!step.config.stageId) err(id, "Elige la etapa a la que se mueve el negocio");
      break;
    case "create_task":
      if (!step.config.title.trim()) err(id, "Escribe qué hay que hacer");
      else if (step.config.title.length > 200) err(id, "El título de la tarea admite hasta 200 caracteres");
      if (step.config.dueInMinutes !== null && !(step.config.dueInMinutes >= 0 && step.config.dueInMinutes <= 525_600)) err(id, "El plazo de la tarea debe ser de 0 minutos a 1 año");
      if (step.config.assignee === "user" && !step.config.userId) err(id, "Elige a quién asignar la tarea");
      break;
  }
}

function checkTimeout(id: string, minutes: number, err: (nodeId: string | null, m: string) => void) {
  if (!(minutes >= 1 && minutes <= MAX_REPLY_TIMEOUT)) err(id, "El tiempo de espera de respuesta debe ser de 1 minuto a 7 días");
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
