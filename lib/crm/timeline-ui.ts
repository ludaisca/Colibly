// Texto de cada elemento de la línea de tiempo (módulo puro: lo usan
// componentes de cliente y pruebas).

import { sourceLabel } from "@/lib/crm/labels";

export interface TimelineItem {
  key: string;
  kind: "activity" | "message" | "note" | "appointment";
  type: string;
  at: string;
  actor: { id: string; name: string | null } | null;
  data: Record<string, unknown>;
}

export interface TimelineText {
  title: string;
  detail?: string;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

const FIELD_LABELS: Record<string, string> = {
  name: "nombre",
  email: "correo",
  phone: "teléfono",
  jobTitle: "puesto",
  companyId: "empresa",
  ownerId: "responsable",
  lifecycle: "etapa del contacto",
  title: "título",
  amount: "importe",
  probability: "probabilidad",
  expectedCloseDate: "cierre esperado",
};

const APPOINTMENT_STATUS: Record<string, string> = {
  scheduled: "agendada",
  completed: "completada",
  cancelled: "cancelada",
  no_show: "sin asistencia",
};

export function describeTimelineItem(item: TimelineItem): TimelineText {
  const d = item.data;
  switch (item.type) {
    case "person.created":
      return { title: "Contacto creado", detail: str(d.source) ? sourceLabel(str(d.source)) : undefined };
    case "person.updated": {
      const changes = d.changes && typeof d.changes === "object" ? Object.keys(d.changes as object) : [];
      const labels = changes.map((k) => FIELD_LABELS[k] ?? k);
      if (str(d.reason) === "deal_won") return { title: "Pasó a cliente al ganar un negocio" };
      return { title: "Datos actualizados", detail: labels.length ? labels.join(", ") : undefined };
    }
    case "person.owner_changed":
      return { title: "Cambió el responsable" };
    case "person.archived":
      return { title: "Contacto archivado" };
    case "person.restored":
      return { title: "Contacto restaurado" };
    case "person.merged":
      return { title: "Se fusionó con otro contacto", detail: str(d.sourceName) };
    case "person.channel_linked":
      return { title: "Canal vinculado" };
    case "deal.created":
      return { title: "Negocio abierto", detail: str(d.stage) };
    case "deal.stage_changed":
      return { title: `Negocio ${str(d.title) ? `«${str(d.title)}» ` : ""}cambió de etapa`, detail: [str(d.from), str(d.to)].filter(Boolean).join(" → ") || undefined };
    case "deal.updated":
      return { title: "Negocio actualizado" };
    case "deal.owner_changed":
      return { title: "Cambió el responsable del negocio" };
    case "deal.archived":
      return { title: "Negocio archivado" };
    case "deal.restored":
      return { title: "Negocio restaurado" };
    case "deal.deleted":
      return { title: "Negocio eliminado" };
    case "task.created":
      return { title: "Tarea creada", detail: str(d.title) };
    case "task.completed":
      return { title: "Tarea completada", detail: str(d.title) };
    case "task.reopened":
      return { title: "Tarea reabierta", detail: str(d.title) };
    case "message.inbound":
      return { title: `Mensaje recibido${str(d.channel) ? ` · ${channelName(str(d.channel)!)}` : ""}`, detail: str(d.text) };
    case "message.outbound":
      return { title: `Mensaje enviado${str(d.channel) ? ` · ${channelName(str(d.channel)!)}` : ""}`, detail: str(d.text) };
    case "note":
      return { title: "Nota", detail: str(d.body) };
    default:
      if (item.type.startsWith("appointment.")) {
        const status = APPOINTMENT_STATUS[item.type.slice("appointment.".length)] ?? "";
        return { title: `Cita ${status}`.trim(), detail: str(d.title) };
      }
      return { title: item.type };
  }
}

function channelName(channel: string): string {
  return ({ WHATSAPP: "WhatsApp", TELEGRAM: "Telegram", MESSENGER: "Messenger", INSTAGRAM: "Instagram", WEBCHAT: "Chat web" } as Record<string, string>)[channel] ?? channel;
}
