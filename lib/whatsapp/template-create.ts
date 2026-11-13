import type { WAAccount, WATemplate } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import type { TemplateCreateInput } from "@/lib/validations";
import { createTemplate, templateInputError } from "./templates";

// Alta de una plantilla en Meta y en Colibly. Única ruta para la bandeja
// (/api/whatsapp/templates/create) y la API pública (POST /api/v1/templates).

export class TemplateCreateError extends Error {
  constructor(
    public readonly status: 400 | 409 | 422,
    message: string
  ) {
    super(message);
  }
}

/** La cuenta debe ser de Meta Cloud con WABA ID y token (si no, 422). */
export function assertCanManageTemplates(account: Pick<WAAccount, "channel" | "wabaId" | "accessToken">): void {
  if (account.channel !== "META_CLOUD" || !account.wabaId || !account.accessToken) {
    throw new TemplateCreateError(422, "Esta cuenta no tiene WABA ID configurado. Configúralo antes de crear plantillas.");
  }
}

export async function createAccountTemplate(account: WAAccount, input: TemplateCreateInput): Promise<WATemplate> {
  const inputError = templateInputError(input);
  if (inputError) throw new TemplateCreateError(400, inputError);
  assertCanManageTemplates(account);

  // El nombre es único por idioma en Meta: la misma plantilla puede existir
  // en varios idiomas.
  const existing = await prisma.wATemplate.findFirst({
    where: { waAccountId: account.id, name: input.name, language: input.language, status: { not: "DELETED" } },
    select: { id: true },
  });
  if (existing) {
    throw new TemplateCreateError(409, `Ya existe una plantilla con el nombre "${input.name}" en ese idioma en esta cuenta`);
  }

  const result = await createTemplate(account.wabaId!, decrypt(account.accessToken!), input);
  if (!result.success) throw new TemplateCreateError(400, result.error);

  // upsert: el webhook de estado (o la sincronización de respaldo) puede haber
  // insertado ya la fila entre que Meta aceptó la plantilla y este punto.
  const data = {
    name: input.name,
    language: input.language,
    category: input.category,
    status: "PENDING",
    // La forma de Meta (array de componentes), la misma que deja la
    // sincronización: getTemplateVariables y la vista previa la leen así.
    components: result.components as object,
    syncedAt: new Date(),
  };
  return prisma.wATemplate.upsert({
    where: { waAccountId_templateId: { waAccountId: account.id, templateId: result.templateId } },
    create: { waAccountId: account.id, templateId: result.templateId, ...data },
    update: { components: data.components, syncedAt: data.syncedAt },
  });
}
