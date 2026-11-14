import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, withApiErrors } from "@/lib/api/respond";
import { deleteApiMedia, findApiMedia, serializeApiMedia } from "@/lib/media/api-media";

type Params = { params: Promise<{ id: string }> };

async function load(organizationId: string, id: string) {
  const row = await findApiMedia(organizationId, id);
  if (!row) throw new ApiError(404, "not_found", "Archivo no encontrado o caducado");
  return row;
}

// GET /api/v1/media/{id} — datos del archivo (tipo, tamaño, vencimiento).
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const { id } = await params;
  return apiOk(serializeApiMedia(await load(ctx.organizationId, id)));
});

// DELETE /api/v1/media/{id} — lo borra antes de que caduque.
export const DELETE = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "messages:send");
  const { id } = await params;
  await deleteApiMedia(await load(ctx.organizationId, id));
  return apiOk({ id, deleted: true });
});

export const POST = methodNotAllowed("GET", "DELETE");
export const PUT = POST;
export const PATCH = POST;
