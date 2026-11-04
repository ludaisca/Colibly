import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api/auth";
import { ApiError, withApiErrors } from "@/lib/api/respond";
import { contentDisposition, mediaReadStream, resolveAbsolutePath } from "@/lib/whatsapp/media-store";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/messages/{id}/media — bytes del medio de un mensaje (imagen,
// audio, video, sticker, documento) de cualquier canal. Es la URL que viaja en
// `message.media.url` de la API y de los webhooks: el integrador la pide con
// su API key. La URL de Meta nunca se expone (caduca en minutos y lleva el
// token de la cuenta). Mismo alcance que leer la conversación; un id fuera del
// alcance responde 404, nunca 403.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  const { id } = await params;
  const select = { mediaUrl: true, mimeType: true, filename: true } as const;
  const message =
    (await prisma.wAMessage.findFirst({ where: { id, chat: { accountId: { in: ctx.accountIds } } }, select })) ??
    (await prisma.channelMessage.findFirst({ where: { id, conversation: { channelAccountId: { in: ctx.channelAccountIds } } }, select }));
  if (!message) throw new ApiError(404, "not_found", "Mensaje no encontrado");
  // Se descarga en segundo plano al llegar: unos segundos sin archivo es normal.
  if (!message.mediaUrl) throw new ApiError(404, "not_found", "El medio aún no está disponible o el mensaje no tiene medio");

  let size: number;
  try {
    const { promises: fs } = await import("fs");
    size = (await fs.stat(resolveAbsolutePath(message.mediaUrl))).size;
  } catch {
    throw new ApiError(404, "not_found", "Archivo no encontrado");
  }

  const headers = new Headers();
  headers.set("Content-Type", message.mimeType ?? "application/octet-stream");
  headers.set("Content-Length", String(size));
  // Siempre descarga: quien lo pide es un integrador, no un navegador.
  headers.set("Content-Disposition", contentDisposition(message.filename, false));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(mediaReadStream(message.mediaUrl) as unknown as ReadableStream, { headers });
});
