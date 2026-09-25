import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors } from "@/lib/api/respond";
import { findScopedContact, serializeContact } from "@/lib/api/resources";
import { apiContactTagSchema } from "@/lib/api/schemas";
import { afterContactTagAdded } from "@/lib/contacts/side-effects";
import { findOrCreateTag, tagBelongsTo } from "@/lib/tags";

type Params = { params: Promise<{ id: string }> };

// POST — { "tagId": "..." } o { "name": "VIP" } (la crea en la cuenta del
// contacto si no existe). Dispara secuencias y el webhook tag.added solo si la
// etiqueta es nueva para el contacto.
export const POST = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "contacts:write");
  const { id } = await params;
  const contact = await findScopedContact(ctx, id);

  const parsed = apiContactTagSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", parsed.error.issues[0].message);

  let tag: { id: string; name: string };
  if (parsed.data.tagId) {
    const found = await prisma.tag.findUnique({ where: { id: parsed.data.tagId } });
    if (!found || !tagBelongsTo(found, { waAccountId: contact.accountId, channelAccountId: contact.channelAccountId })) {
      throw new ApiError(404, "not_found", "Etiqueta no encontrada en la cuenta del contacto");
    }
    tag = found;
  } else {
    tag = await findOrCreateTag(contact, parsed.data.name!);
  }

  if (!contact.tags.some((t) => t.tag.id === tag.id)) {
    await prisma.contactTag.create({ data: { contactId: id, tagId: tag.id } });
    await afterContactTagAdded(id, tag);
  }
  return apiOk(serializeContact(await findScopedContact(ctx, id)));
});

// DELETE ?tagId=...
export const DELETE = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "contacts:write");
  const { id } = await params;
  await findScopedContact(ctx, id);
  const tagId = new URL(req.url).searchParams.get("tagId");
  if (!tagId) throw new ApiError(400, "invalid_request", "tagId es requerido");
  await prisma.contactTag.deleteMany({ where: { contactId: id, tagId } });
  return apiOk(serializeContact(await findScopedContact(ctx, id)));
});
