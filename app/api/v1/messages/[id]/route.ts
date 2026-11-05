import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, withApiErrors, methodNotAllowed } from "@/lib/api/respond";
import { findScopedMessage } from "@/lib/api/messages-feed";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/messages/{id} — un mensaje de cualquier canal con la forma de
// siempre (lib/messages/serialize.ts). Sirve para releerlo con su estado y su
// medio actuales (p. ej. un `media_placeholder` del historial que ya llegó).
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  const { id } = await params;
  const message = await findScopedMessage(ctx, id);
  if (!message) throw new ApiError(404, "not_found", "Mensaje no encontrado");
  return apiOk(message);
});

// Métodos que esta ruta no atiende: 405 en JSON con el header Allow.
export const POST = methodNotAllowed("GET");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
