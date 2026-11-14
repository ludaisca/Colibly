import type { WAAccount, WATemplate } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import type { TemplateCreateInput } from "@/lib/validations";
import { createTemplate, templateInputError } from "./templates";
import { buildTemplateComponents, buildTemplateDefinitionPayload, templateDefinitionError, type TemplateComponentsDef, type TemplateDefinition } from "./template-definition";
import { editMetaTemplate, MetaAdminError, submitMetaTemplate } from "./account-admin";

// Alta de una plantilla en Meta y en Colibly. Única ruta para la bandeja
// (/api/whatsapp/templates/create) y la API pública (POST /api/v1/templates).

export class TemplateCreateError extends Error {
  constructor(
    public readonly status: 400 | 409 | 422,
    message: string,
    /** Código de Meta si Graph rechazó la plantilla. */
    public readonly metaCode: number | null = null
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

/** Errores de Meta al crear/editar: los de la definición son 400 para el integrador. */
function asTemplateError(err: unknown): never {
  if (err instanceof MetaAdminError && err.httpStatus >= 400 && err.httpStatus < 500 && err.httpStatus !== 401 && err.httpStatus !== 403 && err.httpStatus !== 422) {
    throw new TemplateCreateError(400, err.message, err.metaCode);
  }
  throw err;
}

/** Alta con la definición completa de la API pública (template-definition.ts). */
export async function createAccountTemplateFromDefinition(account: WAAccount, def: TemplateDefinition): Promise<WATemplate> {
  const inputError = templateDefinitionError(def);
  if (inputError) throw new TemplateCreateError(400, inputError);
  assertCanManageTemplates(account);

  const existing = await prisma.wATemplate.findFirst({
    where: { waAccountId: account.id, name: def.name, language: def.language, status: { not: "DELETED" } },
    select: { id: true },
  });
  if (existing) {
    throw new TemplateCreateError(409, `Ya existe una plantilla con el nombre "${def.name}" en ese idioma en esta cuenta`);
  }

  const payload = buildTemplateDefinitionPayload(def);
  const created = await submitMetaTemplate(account, payload).catch(asTemplateError);
  const data = {
    name: def.name,
    language: def.language,
    // Meta puede reclasificar la categoría al crearla (p. ej. UTILITY → MARKETING).
    category: created.category ?? def.category,
    status: created.status ?? "PENDING",
    components: payload.components as object,
    syncedAt: new Date(),
  };
  return prisma.wATemplate.upsert({
    where: { waAccountId_templateId: { waAccountId: account.id, templateId: created.id } },
    create: { waAccountId: account.id, templateId: created.id, ...data },
    update: { components: data.components, syncedAt: data.syncedAt },
  });
}

const EDITABLE = new Set(["APPROVED", "REJECTED", "PAUSED"]);

/**
 * Edita una plantilla en Meta: cambia sus componentes (y la categoría, solo si
 * no está aprobada). Queda PENDING hasta la nueva revisión.
 */
export async function editAccountTemplate(
  account: WAAccount,
  template: WATemplate,
  input: { category?: TemplateDefinition["category"]; components: TemplateComponentsDef }
): Promise<WATemplate> {
  assertCanManageTemplates(account);
  if (!EDITABLE.has(template.status)) {
    throw new TemplateCreateError(422, `Solo se editan plantillas APPROVED, REJECTED o PAUSED (esta está ${template.status})`);
  }
  if (input.category && input.category !== template.category && template.status === "APPROVED") {
    throw new TemplateCreateError(422, "Meta no deja cambiar la categoría de una plantilla aprobada");
  }
  const category = (input.category ?? template.category) as TemplateDefinition["category"];
  const def: TemplateDefinition = { name: template.name, language: template.language, category, components: input.components };
  const inputError = templateDefinitionError(def);
  if (inputError) throw new TemplateCreateError(400, inputError);

  const { components, named } = buildTemplateComponents(def);
  await editMetaTemplate(account, template.templateId, {
    components,
    ...(input.category && input.category !== template.category ? { category } : {}),
    ...(named ? { parameter_format: "NAMED" } : {}),
  }).catch(asTemplateError);

  return prisma.wATemplate.update({
    where: { id: template.id },
    data: { components: components as object, category, status: "PENDING", statusReason: null, syncedAt: new Date() },
  });
}
