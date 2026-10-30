import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";
import { getTypingUserIds, markTyping } from "@/lib/typing";

export async function GET(
  _req: Request,
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

    const ids = (await getTypingUserIds(chatId)).filter((id) => id !== session.user.id);
    if (ids.length === 0) return NextResponse.json({ users: [] });

    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return NextResponse.json({ users });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  _req: Request,
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

    const { allowed } = await rateLimit(`chat-typing:${session.user.id}`, 120, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }

    await markTyping(chatId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
