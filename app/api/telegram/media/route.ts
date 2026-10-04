import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { rateLimit } from "@/lib/rate-limit";
import { saveMediaFromBuffer } from "@/lib/whatsapp/media-store";
import { publicErrorMessage } from "@/lib/api-errors";

// Mirror de app/api/whatsapp/media/route.ts, pero Telegram no tiene el paso
// "subir → obtener id" de la Graph API de Meta: aquí solo se persiste una
// copia local (mediaId siempre null); el envío real hacia la Bot API de
// Telegram ocurre en la ruta de envío del chat, leyendo esos bytes ya
// guardados (ver lib/telegram/send.ts:sendTelegramMedia).
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const rl = await rateLimit(`telegram-media-upload:${session.user.id}`, 20, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas subidas, intenta más tarde" }, { status: 429 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const accountId = form.get("accountId");

    if (!(file instanceof File) || typeof accountId !== "string") {
      return NextResponse.json({ error: "Faltan parámetros (file, accountId)" }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo supera el límite de 20MB" }, { status: 413 });
    }

    const channelAccountIds = await getUserChannelAccountIds(session.user.id);
    if (!channelAccountIds.includes(accountId)) {
      return NextResponse.json({ error: "No tienes acceso a esta cuenta" }, { status: 403 });
    }

    const account = await prisma.channelAccount.findFirst({
      where: { id: accountId },
      select: { id: true },
    });

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const bytesSize = buffer.length;

    const stored = await saveMediaFromBuffer(account.id, buffer, file.type || null);

    return NextResponse.json({
      mediaId: null,
      mimeType: file.type || null,
      filename: file.name || null,
      bytesSize,
      localMediaPath: stored.relativePath,
    });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
