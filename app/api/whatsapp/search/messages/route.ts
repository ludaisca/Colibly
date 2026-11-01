import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { rateLimit } from "@/lib/rate-limit";
import { publicErrorMessage } from "@/lib/api-errors";
import { MESSAGE_SEARCH_MAX, MESSAGE_SEARCH_MIN, normalizeMessageQuery, searchMessages } from "@/lib/search/messages";

// Buscar dentro de los mensajes de todas las cuentas que el usuario ve
// (WhatsApp + canales). Solo lectura. Lo usan la lista de chats ("En
// mensajes") y el palette.
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const q = normalizeMessageQuery(new URL(req.url).searchParams.get("q"));
    if (!q) {
      return NextResponse.json({ error: `Escribe entre ${MESSAGE_SEARCH_MIN} y ${MESSAGE_SEARCH_MAX} caracteres` }, { status: 400 });
    }
    if (!(await rateLimit(`message-search:${session.user.id}`, 30, 60)).allowed) {
      return NextResponse.json({ error: "Demasiadas búsquedas seguidas; espera un momento" }, { status: 429 });
    }

    const [waAccountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);
    const results = await searchMessages(q, { waAccountIds, channelAccountIds });
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo buscar en los mensajes") }, { status: 500 });
  }
}
