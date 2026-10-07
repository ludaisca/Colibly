import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { getUserChannelAccountIds } from "@/lib/shared-accounts";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireOrgId } from "@/lib/tenancy";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // Este listado de identidades de canal ya no tiene pantalla (el directorio es por
    // persona, en /contactos). El rol "user" nunca tuvo acceso a él — este 403
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
    const stageId = searchParams.get("stageId");
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
    // Contactos con un negocio abierto en esa etapa.
    if (stageId) where.person = { deals: { some: { stageId, status: "OPEN", archivedAt: null, pipeline: { organizationId: await requireOrgId(session.user.id) } } } };
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
          person: { select: { deals: { where: { status: "OPEN", archivedAt: null }, orderBy: { stageEnteredAt: "desc" }, take: 1, select: { id: true, stage: { select: { id: true, name: true, color: true } } } } } },
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

    // Se aplana a un solo shape (accountId + chat + channel) para que la UI no
    // tenga que ramificar por canal — mismo criterio que GET /api/telegram/chats.
    const items = contacts.map(({ channelAccountId, channelAccount, conversation, person, ...c }) => ({
      ...c,
      // Etapa del negocio abierto más reciente (null = sin negocio abierto).
      stage: person.deals[0]?.stage ?? null,
      accountId: c.accountId ?? channelAccountId!,
      chat: c.chat ?? conversation,
      channel: c.accountId ? ("WHATSAPP" as const) : channelAccount?.channel,
    }));

    return NextResponse.json({ items, total, page, pageSize });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
