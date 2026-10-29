import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { resolveAbsolutePath, mediaReadStream, isInlineSafeMime, isPdfMime, contentDisposition } from "@/lib/whatsapp/media-store";
import { publicErrorMessage } from "@/lib/api-errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { messageId } = await params;
    const accountIds = await getUserAccountIds(session.user.id);

    const message = await prisma.wAMessage.findFirst({
      where: { id: messageId, chat: { accountId: { in: accountIds } } },
      select: {
        id: true,
        mediaUrl: true,
        mimeType: true,
        filename: true,
        messageType: true,
        chat: { select: { accountId: true } },
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    }

    if (!message.mediaUrl) {
      return NextResponse.json({ error: "Medio no disponible" }, { status: 404 });
    }

    let stat;
    try {
      const { promises: fs } = await import("fs");
      stat = await fs.stat(resolveAbsolutePath(message.mediaUrl));
    } catch {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    const stream = mediaReadStream(message.mediaUrl);
    const headers = new Headers();
    headers.set("Content-Type", message.mimeType ?? "application/octet-stream");
    headers.set("Content-Length", String(stat.size));
    // Ver el comentario de lib/channel-media.ts: los documentos ahora se
    // abren inline y no deben quedar cacheados como descarga.
    headers.set("Cache-Control", message.messageType === "document" ? "private, no-cache" : "private, max-age=3600");

    // Inline solo imagen/audio/video de tipos seguros (nunca SVG/HTML); la CSP
    // `sandbox` de estas rutas vive en next.config.ts (la CSP global la pisaría).
    // PDF: inline para que el visor del navegador lo abra (sandbox vía CSP).
    // El resto de documentos se descarga. Un PDF con MIME octet-stream (Meta)
    // se detecta por el nombre y se sirve como PDF.
    const pdfByName = message.messageType === "document" && /\.pdf$/i.test(message.filename ?? "");
    const isPdf = isPdfMime(message.mimeType) || pdfByName;
    if (isPdf && !isPdfMime(message.mimeType)) headers.set("Content-Type", "application/pdf");
    const isInline =
      isPdf ||
      ((message.messageType === "image" || message.messageType === "audio" || message.messageType === "video") &&
        isInlineSafeMime(message.mimeType));

    if (isPdf) {
      headers.set("Content-Disposition", contentDisposition(message.filename, true));
    } else if (!isInline) {
      headers.set("Content-Disposition", contentDisposition(message.filename, false));
    }

    return new Response(stream as unknown as ReadableStream, { headers });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}