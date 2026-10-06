import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { findScopedContact, serializeContact } from "@/lib/api/resources";
import { apiContactUpdateSchema } from "@/lib/api/schemas";
import { setCustomFieldsByKey } from "@/lib/contacts/custom-fields";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "contacts:read");
  const { id } = await params;
  return apiOk(serializeContact(await findScopedContact(ctx, id)));
});

// PATCH — nombre, nombre real y campos personalizados (por key). La etapa de
// venta ya no vive en el contacto sino en sus negocios: PATCH /api/v1/deals/{id}.
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
    await prisma.contact.update({ where: { id }, data: fields });
  }

  return apiOk(serializeContact(await findScopedContact(ctx, id)));
});
