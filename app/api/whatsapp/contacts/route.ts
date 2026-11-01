import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { publicErrorMessage } from "@/lib/api-errors";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // El rol "user" tiene /whatsapp/contactos bloqueado en proxy.ts — este 403
    // cierra el acceso directo a la API (defensa en profundidad, mismo patrón
    // que /api/usuarios). El detalle /contacts/[id] queda abierto: lo usa el
    // ContactDrawer desde el chat, que "user" sí puede ver.
    if (session.user.role === "user") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const accountIds = await getUserAccountIds(session.user.id);
    // Los contactos de canales adicionales cuelgan de
    // channelAccountId en vez de accountId — sin esto, un lead que escribe por
    // Telegram genera su Contact pero queda invisible en el CRM.
    const channelAccountIds = await getUserChannelAccountIds(session.user.id);

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const leadStatus = searchParams.get("leadStatus");
    const tagId = searchParams.get("tagId");
    const search = searchParams.get("search");

    if (accountId && !accountIds.includes(accountId) && !channelAccountIds.includes(accountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    // El filtro de cuenta recibe un id que puede ser de cualquiera de los dos
    // mundos — se aplica a la columna que corresponda. Va dentro de AND (no
    // como where.OR suelto) porque el filtro de búsqueda de abajo también es
    // un OR: asignar ambos al mismo nivel pisaría el alcance por cuenta y
    // expondría contactos de otros usuarios.
    const scopeFilter = accountId
      ? channelAccountIds.includes(accountId)
        ? { channelAccountId: accountId }
        : { accountId }
      : { OR: [{ accountId: { in: accountIds } }, { channelAccountId: { in: channelAccountIds } }] };

    const andFilters: Record<string, unknown>[] = [scopeFilter];
    if (search) {
      andFilters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { remoteJid: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const where: Record<string, unknown> = { AND: andFilters };
    if (leadStatus) where.leadStatus = leadStatus;
    if (tagId) where.tags = { some: { tagId } };

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 25, 1), 100);

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: {
          id: true,
          accountId: true,
          channelAccountId: true,
          channelAccount: { select: { channel: true } },
          remoteJid: true,
          name: true,
          leadStatus: true,
          createdAt: true,
          updatedAt: true,
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          chat: { select: { id: true, unreadCount: true, lastMessageAt: true } },
          conversation: { select: { id: true, unreadCount: true, lastMessageAt: true } },
          _count: { select: { notes: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contact.count({ where }),
    ]);

    // Pie de la tabla (F8): con el MISMO `where` (alcance + filtros), solo si
    // la página lo pide (una vez por cambio de filtros, no por página).
    let summary: { withoutTags: number; withoutConversation: number; withDeal: number; dealValueCents: number } | undefined;
    if (searchParams.get("summary") === "1") {
      const [withoutTags, withoutConversation, deals] = await Promise.all([
        prisma.contact.count({ where: { AND: [where, { tags: { none: {} } }] } }),
        prisma.contact.count({ where: { AND: [where, { chat: { is: null } }, { conversation: { is: null } }] } }),
        prisma.contact.aggregate({ where: { AND: [where, { dealValueCents: { not: null } }] }, _count: { _all: true }, _sum: { dealValueCents: true } }),
      ]);
      summary = { withoutTags, withoutConversation, withDeal: deals._count._all, dealValueCents: deals._sum.dealValueCents ?? 0 };
    }

    // Se aplana a un solo shape (accountId + chat + channel) para que la UI no
    // tenga que ramificar por canal — mismo criterio que GET /api/telegram/chats.
    const items = contacts.map(({ channelAccountId, channelAccount, conversation, ...c }) => ({
      ...c,
      accountId: c.accountId ?? channelAccountId!,
      chat: c.chat ?? conversation,
      channel: c.accountId ? ("WHATSAPP" as const) : channelAccount?.channel,
    }));

    return NextResponse.json({ items, total, page, pageSize, ...(summary ? { summary } : {}) });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
