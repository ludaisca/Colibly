import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { callingErrorResponse, loadDirectChat, peerDigits, readSdp } from "@/lib/whatsapp/calling/access";
import { connectCall, getCallPermission, isCallPermissionError } from "@/lib/whatsapp/calling/meta";

const OPEN = ["RINGING", "CONNECTING", "ACTIVE"] as const;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const accountIds = await getUserAccountIds(session.user.id);
    if (accountIds.length === 0) return NextResponse.json([]);

    const staleBefore = new Date(Date.now() - 90_000);
    await prisma.wACall.updateMany({
      where: { accountId: { in: accountIds }, status: "RINGING", createdAt: { lt: staleBefore } },
      data: { status: "MISSED", endedAt: new Date(), sdpOffer: null, sdpAnswer: null },
    });

    const calls = await prisma.wACall.findMany({
      where: { accountId: { in: accountIds }, status: { in: [...OPEN] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        accountId: true,
        chatId: true,
        direction: true,
        status: true,
        peerWaId: true,
        peerName: true,
        answeredById: true,
        createdAt: true,
        sdpAnswer: true,
      },
    });
    return NextResponse.json(calls.map(({ sdpAnswer, ...call }) => ({ ...call, hasAnswer: !!sdpAnswer })));
  } catch (error) {
    return callingErrorResponse(error, "No se pudieron cargar las llamadas");
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { allowed } = await rateLimit(`wa-call-start:${session.user.id}`, 10, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });

    const body = await req.json().catch(() => null) as { chatId?: unknown; sdp?: unknown } | null;
    const sdp = readSdp(body?.sdp);
    if (!body || typeof body.chatId !== "string" || !sdp) {
      return NextResponse.json({ error: "Falta el chat o la sesión de audio" }, { status: 400 });
    }

    const chat = await loadDirectChat(session.user.id, body.chatId);
    if (!chat) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    const to = peerDigits(chat.remoteJid);
    if (!to) return NextResponse.json({ error: "Este chat no tiene un número al que llamar" }, { status: 400 });

    const permission = await getCallPermission(chat.account, to);
    if (!permission.canStart) {
      return NextResponse.json({
        error: permission.canRequest
          ? "Esta persona todavía no autorizó que la llamemos."
          : "WhatsApp no permite llamar a esta persona ahora.",
        code: "call_permission",
        canRequest: permission.canRequest,
      }, { status: 409 });
    }

    const row = await prisma.wACall.create({
      data: {
        organizationId: chat.account.organizationId,
        accountId: chat.accountId,
        chatId: chat.id,
        contactId: chat.contactId,
        metaCallId: `local:${crypto.randomUUID()}`,
        direction: "BUSINESS_INITIATED",
        status: "RINGING",
        peerWaId: to,
        peerName: chat.name,
        sdpOffer: sdp,
        answeredById: session.user.id,
      },
    });

    try {
      const metaCallId = await connectCall(chat.account, to, sdp, row.id);
      await prisma.wACall.update({ where: { id: row.id }, data: { metaCallId } });
      return NextResponse.json({ id: row.id });
    } catch (error) {
      await prisma.wACall.update({
        where: { id: row.id },
        data: { status: "FAILED", endedAt: new Date(), sdpOffer: null, sdpAnswer: null },
      });
      if (isCallPermissionError(error)) {
        return NextResponse.json({ error: "Esta persona todavía no autorizó que la llamemos.", code: "call_permission", canRequest: true }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return callingErrorResponse(error, "No se pudo iniciar la llamada");
  }
}
