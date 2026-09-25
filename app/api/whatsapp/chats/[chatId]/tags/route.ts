import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { resolveTagScope, tagBelongsTo } from "@/lib/tags";
import { publicErrorMessage } from "@/lib/api-errors";
import { emitDomainEvent } from "@/lib/events/emit";
import { eventRefsForChat } from "@/lib/events/refs";

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

    const chatTags = await prisma.chatTag.findMany({
      where: resolved.channel !== "WHATSAPP" ? { conversationId: chatId } : { chatId },
      select: { tag: { select: { id: true, name: true, color: true } } },
    });

    return NextResponse.json(chatTags.map((ct) => ct.tag));
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
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

    const body = await req.json();
    const tagId = body?.tagId;
    if (!tagId || typeof tagId !== "string") {
      return NextResponse.json({ error: "tagId es requerido" }, { status: 400 });
    }

    const tag = await prisma.tag.findUnique({ where: { id: tagId } });
    // La etiqueta debe ser de la misma cuenta que el chat.
    const chatScope = await resolveTagScope(session.user.id, { chatId });
    if (!tag || !chatScope || !tagBelongsTo(tag, chatScope)) {
      return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
    }

    const target = resolved.channel !== "WHATSAPP" ? { conversationId: chatId } : { chatId };
    const alreadyTagged = await prisma.chatTag.findFirst({ where: { ...target, tagId }, select: { id: true } });
    if (!alreadyTagged) {
      await prisma.chatTag.create({ data: { ...target, tagId } });
      const refs = await eventRefsForChat(chatId);
      if (refs) {
        await emitDomainEvent({ type: "tag.added", ...refs, data: { tagId, tagName: tag.name, target: "conversation" } });
      }
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tagId");
    if (!tagId) {
      return NextResponse.json({ error: "tagId es requerido" }, { status: 400 });
    }

    await prisma.chatTag.deleteMany({
      where: resolved.channel !== "WHATSAPP" ? { conversationId: chatId, tagId } : { chatId, tagId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
