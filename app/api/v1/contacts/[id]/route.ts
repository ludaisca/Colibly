import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { findScopedContact, serializeContact } from "@/lib/api/resources";
import { apiContactUpdateSchema } from "@/lib/api/schemas";
import { setCustomFieldsByKey } from "@/lib/contacts/custom-fields";
import { afterLeadStatusChanged } from "@/lib/contacts/side-effects";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "contacts:read");
  const { id } = await params;
  return apiOk(serializeContact(await findScopedContact(ctx, id)));
});

// PATCH — nombre, nombre real, etapa y campos personalizados (por key). Un
// cambio de etapa dispara lo mismo que moverlo en el Pipeline: Meta CAPI para
// leads de anuncios, secuencias y el webhook contact.lead_status_changed.
export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "contacts:write");
  const { id } = await params;
  const contact = await findScopedContact(ctx, id);

  const parsed = apiContactUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);
  const { customFields, ...fields } = parsed.data;

  if (customFields) {
    const { unknownKeys } = await setCustomFieldsByKey(contact, customFields);
    if (unknownKeys.length > 0) {
      throw new ApiError(400, "invalid_request", `Campos personalizados desconocidos: ${unknownKeys.join(", ")}`);
    }
  }

  if (Object.keys(fields).length > 0) {
    await prisma.contact.update({ where: { id }, data: { ...fields, ...("name" in fields && fields.name !== undefined ? { nameSource: "user" } : {}) } });
  }
  if (fields.leadStatus) {
    await afterLeadStatusChanged(contact, contact.leadStatus, fields.leadStatus);
  }

  return apiOk(serializeContact(await findScopedContact(ctx, id)));
});
