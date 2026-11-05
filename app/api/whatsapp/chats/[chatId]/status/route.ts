import { NextResponse } from "next/server";
import { REQUIRED_FIELDS_CODE } from "@/lib/chats/required-fields";
import { auth } from "@/lib/auth";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { publicErrorMessage } from "@/lib/api-errors";
import { CHAT_STATUSES, ChatActionError, setChatStatus, type ChatStatusValue } from "@/lib/chats/actions";

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
    if (!CHAT_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    }

    try {
      const updated = await setChatStatus(resolved.channel === "WHATSAPP" ? "whatsapp" : "channel", chatId, status as ChatStatusValue);
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof ChatActionError && err.code === "required_fields") {
        return NextResponse.json({ error: err.message, code: REQUIRED_FIELDS_CODE, fields: err.fields }, { status: 422 });
      }
      throw err;
    }
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
