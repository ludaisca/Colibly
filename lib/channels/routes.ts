import type { Channel } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { listChannelChats } from "@/lib/channel-chats";
import { jsonWithEtag } from "@/lib/http/etag";
import { uploadChannelMedia, resolveChannelMedia } from "@/lib/channel-media";

// Handlers que eran idénticos en /api/<canal>/* de los canales genéricos
// (Telegram, Messenger, Instagram, chat web, WhatsApp por QR): cada route.ts
// exporta lo que generan estas funciones con su canal. Lo propio de cada canal
// (dar de alta una cuenta, borrarla y desregistrar su webhook) se queda en su
// ruta o en lib/meta-messaging/routes.ts.

export function serverError(error: unknown, fallback = "Error interno del servidor") {
  return NextResponse.json({ error: publicErrorMessage(error, fallback) }, { status: 500 });
}

export const unauthorized = () => NextResponse.json({ error: "No autorizado" }, { status: 401 });

/**
 * GET /api/<canal>/accounts: propias + compartidas, abierto a todos los roles
 * (chat-workspace.tsx arma con él el rail de cuentas de la bandeja, que
 * "ejecutivo" sí ve). Crear y borrar son lo que se restringe.
 */
export function channelAccountsGET(channel: Channel) {
  return async function GET() {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();
      const accounts = await prisma.channelAccount.findMany({
        // Propias + compartidas: administrar sigue siendo de admins y del dueño.
        where: { channel, id: { in: await getUserChannelAccountIds(session.user.id) } },
        select: {
          id: true,
          userId: true,
          owner: { select: { id: true, name: true, email: true, license: true, disabledAt: true } },
          name: true,
          channel: true,
          status: true,
          errorMessage: true,
          lastActivity: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { conversations: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json(accounts);
    } catch (error) {
      return serverError(error);
    }
  };
}

/** GET /api/<canal>/chats: lista paginada de conversaciones (lib/channel-chats.ts). */
export function channelChatsGET(channel: Channel) {
  return async function GET(req: Request) {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();
      const result = await listChannelChats(session.user.id, channel, new URL(req.url).searchParams);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return jsonWithEtag(req, result.data);
    } catch (error) {
      return serverError(error);
    }
  };
}

/**
 * POST /api/<canal>/media: guarda una copia local del archivo saliente
 * (uploadChannelMedia valida la cuenta); el envío lo lee de disco. `slug`
 * solo separa el límite de subidas por canal.
 */
export function channelMediaUploadPOST(slug: string) {
  return async function POST(req: Request) {
    try {
      const session = await auth();
      if (!session?.user?.id) return unauthorized();

      const rl = await rateLimit(`${slug}-media-upload:${session.user.id}`, 20, 60);
      if (!rl.allowed) return NextResponse.json({ error: "Demasiadas subidas, intenta más tarde" }, { status: 429 });

      const form = await req.formData();
      const file = form.get("file");
      const accountId = form.get("accountId");
      if (!(file instanceof File) || typeof accountId !== "string") {
        return NextResponse.json({ error: "Faltan parámetros (file, accountId)" }, { status: 400 });
      }
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: "El archivo supera el límite de 20MB" }, { status: 413 });
      }

      const result = await uploadChannelMedia(session.user.id, accountId, file);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(result.data);
    } catch (error) {
      return serverError(error, "Error interno");
    }
  };
}

/** GET /api/<canal>/messages/[messageId]/media: proxy autenticado del archivo (resolveChannelMedia valida el acceso). */
export async function channelMessageMediaGET(_req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const { messageId } = await params;
    const result = await resolveChannelMedia(session.user.id, messageId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return new Response(result.stream as unknown as ReadableStream, { headers: result.headers });
  } catch (error) {
    return serverError(error, "Error interno");
  }
}
