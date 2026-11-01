import { NextResponse } from "next/server";
import { REQUIRED_FIELDS_CODE, missingRequiredForChat, requiredFieldsMessage } from "@/lib/chats/required-fields";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForChat } from "@/lib/events/refs";
import { maybeSendCsat } from "@/lib/csat/send-survey";

const VALID_STATUSES = ["OPEN", "PENDING", "RESOLVED"] as const;

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
    const status = body?.status;

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    }

    // Atributos de conversación obligatorios (F4): no se resuelve con huecos.
    if (status === "RESOLVED") {
      const missing = await missingRequiredForChat(resolved.channel === "WHATSAPP" ? "whatsapp" : "channel", chatId);
      if (missing.length > 0) {
        return NextResponse.json({ error: requiredFieldsMessage(missing), code: REQUIRED_FIELDS_CODE, fields: missing }, { status: 422 });
      }
    }

    if (resolved.channel !== "WHATSAPP") {
      const current = await prisma.conversation.findUniqueOrThrow({ where: { id: chatId }, select: { status: true } });
      const wasResolved = current.status === "RESOLVED";
      const willBeResolved = status === "RESOLVED";
      const updated = await prisma.conversation.update({
        where: { id: chatId },
        data: {
          status,
          resolvedAt: willBeResolved ? new Date() : wasResolved && !willBeResolved ? null : undefined,
          // Un chat resuelto no espera respuesta (lib/chats/waiting.ts).
          ...(willBeResolved ? { waitingSince: null } : {}),
        },
        select: { id: true, status: true, resolvedAt: true },
      });
      if (willBeResolved && !wasResolved) await emitResolved(chatId);
      return NextResponse.json(updated);
    }

    const chat = await prisma.wAChat.findUniqueOrThrow({ where: { id: chatId }, select: { status: true } });
    const wasResolved = chat.status === "RESOLVED";
    const willBeResolved = status === "RESOLVED";

    const updated = await prisma.wAChat.update({
      where: { id: chatId },
      data: {
        status,
        resolvedAt: willBeResolved ? new Date() : wasResolved && !willBeResolved ? null : undefined,
        ...(willBeResolved ? { waitingSince: null } : {}),
      },
      select: { id: true, status: true, resolvedAt: true },
    });
    if (willBeResolved && !wasResolved) {
      await emitResolved(chatId);
      // La encuesta es best-effort: resolver el chat nunca debe fallar por un
      // envío de WhatsApp que Meta rechace.
      await maybeSendCsat(chatId).catch((error) => console.error("[csat] no se pudo enviar la encuesta", error));
    }

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function emitResolved(chatId: string) {
  const refs = await eventRefsForChat(chatId);
  if (refs) await emitDomainEvent({ type: "conversation.resolved", ...refs, data: {} });
}
