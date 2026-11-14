import { describeTemplateSend } from "@/lib/whatsapp/template-send";
import { getTemplateVariables } from "@/lib/whatsapp/template-variables";

// Forma pública de los catálogos que un integrador necesita para armar
// llamadas: plantillas (POST /messages), etiquetas (tagId), usuarios
// (assignedToId) y automatizaciones (POST /automations/{id}/runs).

interface TemplateRow {
  id: string;
  waAccountId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  statusReason?: string | null;
  components: unknown;
  syncedAt: Date;
}

function componentText(components: unknown, type: string): string | null {
  if (!Array.isArray(components)) return null;
  const c = components.find((x) => x && typeof x === "object" && (x as { type?: unknown }).type === type) as { text?: unknown } | undefined;
  return typeof c?.text === "string" ? c.text : null;
}

export function serializeTemplate(t: TemplateRow) {
  const vars = getTemplateVariables(t.components);
  return {
    id: t.id,
    accountId: t.waAccountId,
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    // Motivo del rechazo, pausa o aviso de calidad (texto corto); null si no hay.
    statusReason: t.statusReason ?? null,
    // Lo que pide POST /messages con type "template".
    params: {
      bodyParamCount: vars.bodyParamCount,
      header: vars.header.required ? { format: vars.header.format } : null,
      buttonParamRequired: vars.buttonUrl?.required ?? false,
    },
    // Todo lo que pide el envío: variables con nombre, botones, código OTP,
    // oferta, carrusel (lib/whatsapp/template-send.ts).
    send: describeTemplateSend(t.components, t.category),
    // Texto del cuerpo con sus {{1}}, {{2}}… para mostrarlo o validar.
    bodyText: componentText(t.components, "BODY"),
    syncedAt: t.syncedAt,
  };
}

export function serializeTag(t: { id: string; name: string; color: string; waAccountId: string | null; channelAccountId: string | null; createdAt: Date }) {
  return { id: t.id, accountId: t.waAccountId ?? t.channelAccountId, name: t.name, color: t.color, createdAt: t.createdAt };
}

export function serializeTeam(t: { id: string; name: string; createdAt: Date; members: Array<{ userId: string }> }) {
  return { id: t.id, name: t.name, memberIds: t.members.map((m) => m.userId), createdAt: t.createdAt };
}

export function serializeUser(u: { id: string; name: string | null; email: string; role: string; disabledAt: Date | null }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.disabledAt === null };
}

export function serializeAutomation(a: {
  id: string;
  waAccountId: string | null;
  channelAccountId: string | null;
  name: string;
  description: string | null;
  status: string;
  triggerType: string | null;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    accountId: a.waAccountId ?? a.channelAccountId,
    name: a.name,
    description: a.description,
    status: a.status,
    triggerType: a.triggerType,
    // Solo las activas con disparador "manual" aceptan POST /automations/{id}/runs.
    runnable: a.status === "ACTIVE" && a.triggerType === "manual",
    updatedAt: a.updatedAt,
  };
}
