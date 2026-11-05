import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";
import { assignChat, ChatActionError } from "@/lib/chats/actions";

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
    // `self: true` es el atajo de "Asignarme": evita que el cliente tenga que
    // conocer su propio id y hace explícita la intención en la API.
    const assignedToId: string | null = body?.self === true ? session.user.id : (body?.assignedToId ?? null);

    try {
      const updated = await assignChat(resolved.channel === "WHATSAPP" ? "whatsapp" : "channel", chatId, assignedToId, session.user.id);
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof ChatActionError && err.code === "invalid_assignee") {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
