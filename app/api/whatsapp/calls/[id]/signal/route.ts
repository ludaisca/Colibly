import { emitCallAnswered, emitCallEnded } from "@/lib/whatsapp/calling/call-events";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { callingErrorResponse, readSdp } from "@/lib/whatsapp/calling/access";
import { callLogBody } from "@/lib/whatsapp/calling/events";
import { callCaptureFields, signalCall } from "@/lib/whatsapp/calling/meta";

const ACTIONS = new Set(["pre_accept", "accept", "reject", "terminate"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { allowed } = await rateLimit(`wa-call-signal:${session.user.id}`, 30, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });

    const { id } = await params;
    const body = await req.json().catch(() => null) as { action?: unknown; sdp?: unknown } | null;
    const action = typeof body?.action === "string" ? body.action : "";
    if (!ACTIONS.has(action)) return NextResponse.json({ error: "Acción de llamada no válida" }, { status: 400 });

    const accountIds = await getUserAccountIds(session.user.id);
    const call = await prisma.wACall.findFirst({ where: { id, accountId: { in: accountIds } }, include: { account: true } });
    if (!call) return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });
    if (call.metaCallId.startsWith("local:")) {
      return NextResponse.json({ error: "La llamada todavía no está lista" }, { status: 409 });
    }

    const sdp = readSdp(body?.sdp);
    if ((action === "pre_accept" || action === "accept") && !sdp) {
      return NextResponse.json({ error: "Falta la sesión de audio" }, { status: 400 });
    }

    if (action === "pre_accept") {
      const claimed = await prisma.wACall.updateMany({
        where: { id: call.id, status: "RINGING" },
        data: { status: "CONNECTING", answeredById: session.user.id, sdpAnswer: sdp },
      });
      const mine = claimed.count > 0 || (call.status === "CONNECTING" && call.answeredById === session.user.id);
      if (!mine) return NextResponse.json({ error: "Alguien más ya contestó esta llamada" }, { status: 409 });
      try {
        await signalCall(call.account, { call_id: call.metaCallId, action: "pre_accept", session: { sdp_type: "answer", sdp } });
      } catch (error) {
        if (claimed.count > 0) {
          await prisma.wACall.update({ where: { id: call.id }, data: { status: "RINGING", answeredById: null, sdpAnswer: null } });
        }
        throw error;
      }
      return NextResponse.json({ status: "CONNECTING" });
    }

    if (action === "accept") {
      if (call.answeredById && call.answeredById !== session.user.id) {
        return NextResponse.json({ error: "Alguien más ya contestó esta llamada" }, { status: 409 });
      }
      await signalCall(call.account, {
        call_id: call.metaCallId,
        action: "accept",
        session: { sdp_type: "answer", sdp },
        ...callCaptureFields(),
      });
      const answered = await prisma.wACall.update({
        where: { id: call.id },
        data: { status: "ACTIVE", answeredById: session.user.id, startedAt: call.startedAt ?? new Date(), sdpAnswer: sdp },
      });
      if (call.status !== "ACTIVE") await emitCallAnswered(answered);
      return NextResponse.json({ status: "ACTIVE" });
    }

    if (action === "reject") {
      const claimed = await prisma.wACall.updateMany({
        where: { id: call.id, status: { in: ["RINGING", "CONNECTING"] } },
        data: { status: "REJECTED", endedAt: new Date(), sdpOffer: null, sdpAnswer: null, answeredById: session.user.id },
      });
      if (claimed.count === 0) return NextResponse.json({ status: call.status });
      await signalCall(call.account, { call_id: call.metaCallId, action: "reject" });
      await logTerminal(call.chatId, call.direction, call.metaCallId, "REJECTED", null, session.user.id);
      await emitCallEnded({ ...call, endedAt: new Date() }, "REJECTED", null);
      return NextResponse.json({ status: "REJECTED" });
    }

    await signalCall(call.account, { call_id: call.metaCallId, action: "terminate" });
    const duration = call.startedAt ? Math.max(0, Math.round((Date.now() - call.startedAt.getTime()) / 1000)) : 0;
    const connected = call.status === "ACTIVE" || duration > 0;
    const outcome = connected ? "ENDED" : call.direction === "USER_INITIATED" ? "REJECTED" : "MISSED";
    const ended = await prisma.wACall.update({
      where: { id: call.id },
      data: {
        status: outcome,
        endedAt: new Date(),
        durationSeconds: connected ? duration : 0,
        sdpOffer: null,
        sdpAnswer: null,
      },
    });
    await emitCallEnded(ended, outcome, ended.durationSeconds);
    await logTerminal(call.chatId, call.direction, call.metaCallId, outcome, connected ? duration : 0, call.answeredById ?? session.user.id);
    return NextResponse.json({ status: outcome });
  } catch (error) {
    return callingErrorResponse(error, "No se pudo actualizar la llamada");
  }
}

async function logTerminal(chatId: string | null, direction: "USER_INITIATED" | "BUSINESS_INITIATED", metaCallId: string, outcome: string, duration: number | null, senderId: string | null) {
  if (!chatId) return;
  const body = callLogBody(direction, outcome, duration);
  const now = new Date();
  try {
    await prisma.wAMessage.create({
      data: {
        wamid: `call:${metaCallId}`,
        chatId,
        direction: direction === "USER_INITIATED" ? "INBOUND" : "OUTBOUND",
        messageType: "text",
        body,
        status: "sent",
        senderId,
        timestamp: now,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") return;
    throw error;
  }
  await prisma.wAChat.update({ where: { id: chatId }, data: { lastMessage: body, lastMessageAt: now } });
}
