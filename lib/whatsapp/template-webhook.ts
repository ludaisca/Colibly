import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateWhatsAppWebhookSignature } from "@/lib/meta/platform-app";
import { interpretStatusEvent, type TemplateCategoryEventValue, type TemplateStatusEventValue } from "./template-events";
import { syncAccountTemplates } from "./template-sync";

// Campos de plantillas del webhook de WhatsApp. Se suscriben en la app de Meta
// (la de la plataforma para Registro integrado/Coexistencia, la propia de cada
// cuenta manual) junto a `messages`.
export const TEMPLATE_FIELDS: readonly string[] = ["message_template_status_update", "template_category_update"];

type TemplateField = "message_template_status_update" | "template_category_update";

/**
 * Autentica el evento (HMAC del payload, igual que el resto de campos) con las
 * cuentas de esa WABA y lo aplica a la plantilla de cada una. Las plantillas son
 * de la WABA: varios números de Coexistencia bajo la misma WABA comparten el
 * evento y cada cuenta guarda su propia fila.
 */
export async function handleTemplateChange(opts: {
  field: TemplateField;
  wabaId: string | undefined;
  value: unknown;
  rawBody: string;
  signature: string | null;
}): Promise<void> {
  if (!opts.wabaId || !opts.value || typeof opts.value !== "object") return;
  const accounts = await prisma.wAAccount.findMany({ where: { wabaId: opts.wabaId, status: { not: "DISCONNECTED" } } });
  for (const account of accounts) {
    if (!(await validateWhatsAppWebhookSignature(opts.rawBody, opts.signature, account))) continue;
    if (opts.field === "message_template_status_update") {
      await applyTemplateStatusUpdate(account.id, account.userId, opts.value as TemplateStatusEventValue);
    } else {
      await applyTemplateCategoryUpdate(account.id, opts.value as TemplateCategoryEventValue);
    }
  }
}

async function findTemplate(accountId: string, metaId: number | string | undefined) {
  if (metaId === undefined || metaId === null || metaId === "") return null;
  return prisma.wATemplate.findUnique({
    where: { waAccountId_templateId: { waAccountId: accountId, templateId: String(metaId) } },
  });
}

/** Trae la plantilla que aún no conocemos (creada en el Business Manager o por una carrera con la creación). */
function syncInBackground(accountId: string) {
  after(async () => {
    const account = await prisma.wAAccount.findUnique({ where: { id: accountId } });
    if (account) await syncAccountTemplates(account).catch((e) => console.warn("[templates] sync desde webhook falló", e instanceof Error ? e.message : e));
  });
}

export async function applyTemplateStatusUpdate(accountId: string, ownerId: string, value: TemplateStatusEventValue): Promise<void> {
  const template = await findTemplate(accountId, value.message_template_id);
  if (!template) {
    syncInBackground(accountId);
    return;
  }
  const change = interpretStatusEvent(value, template.name);
  if (!change) return;

  const nextStatus = change.status ?? template.status;
  // Idempotente: Meta reintenta los webhooks. Solo la entrega que cambia algo avisa.
  if (nextStatus === template.status && (change.reason ?? null) === (template.statusReason ?? null)) return;
  const claimed = await prisma.wATemplate.updateMany({
    where: { id: template.id, status: template.status, statusReason: template.statusReason },
    data: { status: nextStatus, statusReason: change.reason, syncedAt: new Date() },
  });
  if (claimed.count === 0 || !change.notify) return;

  await prisma.notification.create({
    data: {
      userId: ownerId,
      type: "ACCOUNT_STATUS",
      title: change.title,
      body: change.reason ? `Meta indicó: ${change.reason}.` : "Ya puedes usarla en chats, campañas y automatizaciones.",
      link: "/whatsapp/plantillas",
    },
  });
}

export async function applyTemplateCategoryUpdate(accountId: string, value: TemplateCategoryEventValue): Promise<void> {
  const template = await findTemplate(accountId, value.message_template_id);
  if (!template) {
    syncInBackground(accountId);
    return;
  }
  const next = (value.new_category ?? "").toUpperCase();
  if (!next || next === template.category) return;
  await prisma.wATemplate.updateMany({ where: { id: template.id, category: template.category }, data: { category: next, syncedAt: new Date() } });
}
