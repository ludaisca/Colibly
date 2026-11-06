// Webhooks de plantillas de Meta (campos message_template_status_update y
// template_category_update). Las funciones puras traducen el evento a lo que se
// guarda y a lo que se avisa; `applyTemplateStatusUpdate` lo aplica a la base.

export interface TemplateStatusEventValue {
  event?: string;
  message_template_id?: number | string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string | null;
  other_info?: { title?: string; description?: string } | null;
  disable_info?: { disable_date?: string } | null;
}

export interface TemplateCategoryEventValue {
  message_template_id?: number | string;
  message_template_name?: string;
  previous_category?: string;
  new_category?: string;
}

/** Estados de Meta que se guardan tal cual como `WATemplate.status`. */
const PASS_THROUGH = new Set(["PENDING", "REJECTED", "PAUSED", "DISABLED", "IN_APPEAL", "PENDING_DELETION", "ARCHIVED", "LIMIT_EXCEEDED", "DELETED"]);

export interface TemplateStatusChange {
  /** Estado nuevo; null si el evento no cambia el estado (p. ej. FLAGGED). */
  status: string | null;
  /** Texto corto y legible para mostrar junto al estado; null si no hay. */
  reason: string | null;
  /** Si hay que avisar a la persona dueña de la cuenta. */
  notify: boolean;
  title: string;
}

const REJECTION_REASONS: Record<string, string> = {
  ABUSIVE_CONTENT: "contenido abusivo",
  INVALID_FORMAT: "formato no válido",
  NONE: "",
  PROMOTIONAL: "contenido promocional en una plantilla de utilidad",
  SCAM: "posible fraude",
  TAG_CONTENT_MISMATCH: "la categoría no coincide con el contenido",
};

function reasonText(raw: string | null | undefined, extra?: string | null): string | null {
  const key = (raw ?? "").trim();
  const known = key in REJECTION_REASONS ? REJECTION_REASONS[key] : key.toLowerCase().replace(/_/g, " ");
  const text = [known, extra?.trim()].filter(Boolean).join(" — ");
  return text ? text.slice(0, 300) : null;
}

/** Qué hace un `message_template_status_update` con la plantilla. Puro. */
export function interpretStatusEvent(value: TemplateStatusEventValue, templateName: string): TemplateStatusChange | null {
  const event = (value.event ?? "").toUpperCase();
  if (!event) return null;
  const name = `"${value.message_template_name ?? templateName}"`;
  const other = value.other_info?.description ?? value.other_info?.title ?? null;

  if (event === "APPROVED" || event === "REINSTATED") {
    return { status: "APPROVED", reason: null, notify: true, title: `Plantilla ${name} aprobada` };
  }
  if (event === "REJECTED") {
    return { status: "REJECTED", reason: reasonText(value.reason, other), notify: true, title: `Plantilla ${name} rechazada` };
  }
  if (event === "PAUSED") {
    return { status: "PAUSED", reason: reasonText(value.reason, other) ?? "pausada por baja calidad", notify: true, title: `Plantilla ${name} pausada` };
  }
  if (event === "DISABLED") {
    return { status: "DISABLED", reason: reasonText(value.reason, other) ?? "desactivada por Meta", notify: true, title: `Plantilla ${name} desactivada` };
  }
  if (event === "FLAGGED") {
    // Sigue enviándose, pero Meta avisa que la pausará si la calidad no mejora.
    return { status: null, reason: "marcada por calidad: Meta la pausará si no mejora", notify: true, title: `Plantilla ${name} en riesgo` };
  }
  if (PASS_THROUGH.has(event)) {
    return { status: event, reason: reasonText(value.reason, other), notify: false, title: `Plantilla ${name}: ${event}` };
  }
  return null; // evento que no conocemos: se ignora y se sincronizará más tarde
}

export function describeStatusForUser(status: string): string {
  switch (status) {
    case "APPROVED": return "Aprobada";
    case "PENDING": return "En revisión";
    case "IN_APPEAL": return "En apelación";
    case "REJECTED": return "Rechazada";
    case "PAUSED": return "Pausada";
    case "DISABLED": return "Desactivada";
    case "DELETED": return "Eliminada";
    default: return status;
  }
}
