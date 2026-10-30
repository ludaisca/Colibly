import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";

const MAX_SNOOZE_DAYS = 30;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!("until" in (body ?? {}))) {
      return NextResponse.json({ error: "Falta la fecha de posposición" }, { status: 400 });
    }

    let snoozedUntil: Date | null = null;
    if (body.until !== null) {
      const parsed = new Date(body.until);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });
      }
      const max = Date.now() + MAX_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
      if (parsed.getTime() <= Date.now()) {
        return NextResponse.json({ error: "La fecha debe ser futura" }, { status: 400 });
      }
      if (parsed.getTime() > max) {
        return NextResponse.json({ error: `Máximo ${MAX_SNOOZE_DAYS} días` }, { status: 400 });
      }
      snoozedUntil = parsed;
    }

    if (resolved.channel !== "WHATSAPP") {
      const updated = await prisma.conversation.update({
        where: { id: chatId },
        data: { snoozedUntil },
        select: { id: true, snoozedUntil: true },
      });
      return NextResponse.json(updated);
    }

    const updated = await prisma.wAChat.update({
      where: { id: chatId },
      data: { snoozedUntil },
      select: { id: true, snoozedUntil: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
