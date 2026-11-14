import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { API_MEDIA_MAX_BYTES } from "@/lib/api/constants";
import { fetchOutboundMedia, fetchOutboundSticker, OutboundMediaError, type OutboundMediaFile } from "@/lib/messaging/outbound-media";
import { API_MEDIA_TYPES, serializeApiMedia, storeApiMedia, validateApiMediaFile, type ApiMediaType } from "@/lib/media/api-media";

const mediaType = z.enum(API_MEDIA_TYPES, { message: `type debe ser ${API_MEDIA_TYPES.join(", ")}` });
const urlBody = z
  .object({
    type: mediaType,
    url: z.string().trim().url("url debe ser una URL").max(2048).refine((v) => v.startsWith("https://"), "url debe usar https://"),
    filename: z.string().trim().min(1).max(200).optional(),
    mimeType: z.string().trim().min(3).max(127).optional(),
  })
  .strict();

// POST /api/v1/media — sube un archivo para reusarlo: `media: { id }` en
// POST /messages y `headerParam` de las plantillas. multipart/form-data
// (campos file y type) o JSON con una URL https. Caduca a los 30 días.
export const POST = withApiErrors(async (req: Request) => {
  const ctx = await authenticateApiKey(req, "messages:send");

  let type: ApiMediaType;
  let file: OutboundMediaFile;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await req.formData().catch(() => {
        throw new ApiError(400, "invalid_request", "No se pudo leer el formulario multipart");
      });
      const parsedType = mediaType.safeParse(form.get("type"));
      if (!parsedType.success) throw new ApiError(400, "invalid_request", parsedType.error.issues[0].message, undefined, [{ path: "type", message: parsedType.error.issues[0].message }]);
      type = parsedType.data;
      const upload = form.get("file");
      if (!(upload instanceof File)) throw new ApiError(400, "invalid_request", "Falta el campo file", undefined, [{ path: "file", message: "requerido" }]);
      const name = typeof form.get("filename") === "string" ? String(form.get("filename")).trim().slice(0, 200) : "";
      file = { buffer: Buffer.from(await upload.arrayBuffer()), mimeType: upload.type, filename: name || upload.name || "" };
      file = await validateApiMediaFile(type, file);
    } else {
      const body = await readJsonBody(req, urlBody);
      type = body.type;
      file = type === "sticker" ? await fetchOutboundSticker(body.url) : await fetchOutboundMedia(type, body);
    }
  } catch (err) {
    if (err instanceof OutboundMediaError) throw new ApiError(400, "invalid_request", err.message);
    throw err;
  }

  const row = await storeApiMedia(ctx.organizationId, type, file);
  return apiOk(serializeApiMedia(row), 201);
}, { maxBodyBytes: API_MEDIA_MAX_BYTES });

export const GET = methodNotAllowed("POST");
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
