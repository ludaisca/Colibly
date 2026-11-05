import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveChatChannel } from "@/lib/chat-resolver";
import { requireOrgId } from "@/lib/tenancy";
import { publicErrorMessage } from "@/lib/api-errors";
import { ChatActionError, setChatTeam } from "@/lib/chats/actions";

// Mover un chat a un equipo ({ teamId } o null para quitarlo). Cualquier rol
// que vea el chat; el equipo debe ser de la organización.
export async function PATCH(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { chatId } = await params;
    const resolved = await resolveChatChannel(chatId, session.user.id);
    if (!resolved) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const teamId = body?.teamId;
    if (teamId !== null && (typeof teamId !== "string" || teamId.length > 64)) {
      return NextResponse.json({ error: "teamId debe ser el id de un equipo o null" }, { status: 400 });
    }
    try {
      const result = await setChatTeam(resolved.channel === "WHATSAPP" ? "whatsapp" : "channel", chatId, teamId, {
        organizationId: await requireOrgId(session.user.id),
        actorId: session.user.id,
      });
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof ChatActionError && err.code === "invalid_team") return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
