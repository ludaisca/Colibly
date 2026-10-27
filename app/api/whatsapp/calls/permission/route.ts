import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { callingErrorResponse, loadDirectChat, peerDigits } from "@/lib/whatsapp/calling/access";
import { getCallPermission, sendCallPermissionRequest } from "@/lib/whatsapp/calling/meta";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { allowed } = await rateLimit(`wa-call-permission:${session.user.id}`, 5, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos. WhatsApp limita estas solicitudes." }, { status: 429 });

    const body = await req.json().catch(() => null) as { chatId?: unknown } | null;
    if (!body || typeof body.chatId !== "string") {
      return NextResponse.json({ error: "Falta el chat" }, { status: 400 });
    }
    const chat = await loadDirectChat(session.user.id, body.chatId);
    if (!chat) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    const to = peerDigits(chat.remoteJid);
    if (!to) return NextResponse.json({ error: "Este chat no tiene un número" }, { status: 400 });

    const permission = await getCallPermission(chat.account, to);
    if (!permission.canRequest) {
      return NextResponse.json({ error: "WhatsApp no permite pedir otra autorización de llamada ahora.", code: "call_permission" }, { status: 409 });
    }

    const wamid = await sendCallPermissionRequest(chat.account, to);
    const now = new Date();
    const text = "Solicitud para poder llamarte";
    await prisma.wAMessage.create({
      data: {
        wamid,
        chatId: chat.id,
        direction: "OUTBOUND",
        messageType: "text",
        body: text,
        status: "sent",
        senderId: session.user.id,
        timestamp: now,
      },
    });
    await prisma.wAChat.update({ where: { id: chat.id }, data: { lastMessage: text, lastMessageAt: now } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return callingErrorResponse(error, "No se pudo pedir permiso para llamar");
  }
}
