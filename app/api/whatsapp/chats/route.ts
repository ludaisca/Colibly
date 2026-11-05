import { NextResponse } from "next/server";
import { teamFilterIds } from "@/lib/teams/teams";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { buildWaChatWhere, mapWaChatRow, parseChatListFilters, WA_CHAT_SELECT } from "@/lib/chats/query";
import { publicErrorMessage } from "@/lib/api-errors";
import { jsonWithEtag } from "@/lib/http/etag";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const accountIds = await getUserAccountIds(session.user.id);

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");

    if (accountId && !accountIds.includes(accountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const filters = parseChatListFilters(searchParams, session.user.id);
    filters.teamIds = await teamFilterIds(searchParams.get("team"), session.user.id);
    const where = buildWaChatWhere(filters, accountIds);

    // Paginación opt-in: sin `page`/`pageSize` en la query se preserva el
    // comportamiento legado (array plano completo) para los consumidores
    // que aún no la usan (dashboard/page.tsx, whatsapp/page.tsx).
    const pageParam = searchParams.get("page");
    const paginate = pageParam !== null;
    const page = Math.max(1, Number(pageParam) || 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 30, 1), 100);

    const [rows, total] = await Promise.all([
      prisma.wAChat.findMany({
        where,
        select: WA_CHAT_SELECT,
        orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
        ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      paginate ? prisma.wAChat.count({ where }) : Promise.resolve(null),
    ]);

    const chats = rows.map(mapWaChatRow);

    if (paginate) {
      return jsonWithEtag(req, { items: chats, total, page, pageSize });
    }
    return NextResponse.json(chats);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
