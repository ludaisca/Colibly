import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserAccountIds, getUserChannelAccountIds } from "@/lib/shared-accounts";
import { getViewCountsCached } from "@/lib/chats/counts";
import { publicErrorMessage } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithEtag } from "@/lib/http/etag";

// Contadores de las vistas rápidas (lib/chats/counts.ts). La bandeja los
// recibe por GET /api/inbox/sync; este endpoint queda para la primera carga.
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { allowed } = await rateLimit(`chat-counts:${session.user.id}`, 60, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

    const [accountIds, channelAccountIds] = await Promise.all([
      getUserAccountIds(session.user.id),
      getUserChannelAccountIds(session.user.id),
    ]);
    return jsonWithEtag(req, await getViewCountsCached(session.user.id, accountIds, channelAccountIds));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}
