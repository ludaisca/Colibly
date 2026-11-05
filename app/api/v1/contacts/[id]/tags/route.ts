import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors, readJsonBody, methodNotAllowed } from "@/lib/api/respond";
import { findScopedContact, serializeContact } from "@/lib/api/resources";
import { apiContactTagSchema } from "@/lib/api/schemas";
import { afterContactTagAdded } from "@/lib/contacts/side-effects";
import { findOrCreateTag, tagBelongsTo } from "@/lib/tags";
import { withIdempotency } from "@/lib/api/idempotency";

type Params = { params: Promise<{ id: string }> };

// POST — { "tagId": "..." } o { "name": "VIP" } (la crea en la cuenta del
// contacto si no existe). Dispara secuencias y el webhook tag.added solo si la
// etiqueta es nueva para el contacto.
export const POST = withIdempotency(withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "contacts:write");
  const { id } = await params;
  const contact = await findScopedContact(ctx, id);

  const body = await readJsonBody(req, apiContactTagSchema);

  let tag: { id: string; name: string };
  if (body.tagId) {
    const found = await prisma.tag.findUnique({ where: { id: body.tagId } });
    if (!found || !tagBelongsTo(found, { waAccountId: contact.accountId, channelAccountId: contact.channelAccountId })) {
      throw new ApiError(404, "not_found", "Etiqueta no encontrada en la cuenta del contacto");
    }
    tag = found;
  } else {
    tag = await findOrCreateTag(contact, body.name!);
  }

  if (!contact.tags.some((t) => t.tag.id === tag.id)) {
    await prisma.contactTag.create({ data: { contactId: id, tagId: tag.id } });
    await afterContactTagAdded(id, tag);
  }
  return apiOk(serializeContact(await findScopedContact(ctx, id)));
}));

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

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const GET = methodNotAllowed("POST", "DELETE");
export const PUT = GET;
export const PATCH = GET;
