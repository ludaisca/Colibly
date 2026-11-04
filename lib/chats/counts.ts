import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";
import { buildChannelChatWhere, buildWaChatWhere, parseChatListFilters } from "@/lib/chats/query";

// Contadores de las vistas rápidas de la bandeja (U4): chats activos —abiertos
// o pendientes y sin posponer— de todas las cuentas del usuario, en WhatsApp y
// en los canales genéricos. Usa los mismos builders que la lista, así el
// número coincide con lo que se ve al aplicar la vista. Compartido por
// GET /api/whatsapp/chats/counts y GET /api/inbox/sync.
const VIEWS = {
  awaiting: "awaiting=1",
  mine: "assigned=me",
  unassigned: "assigned=unassigned",
  all: "",
} as const;

export type ViewCounts = Record<keyof typeof VIEWS, number>;

/**
 * "Todos", "Míos" y "Sin asignar" son el mismo conjunto de chats activos
 * partido por asignado: salen de UN groupBy por tabla en lugar de 3 `count`
 * que recorrían las mismas filas (docs/RENDIMIENTO_2026-11-04.md). Puro, para
 * probarlo: recibe los grupos ya sumados de las dos tablas.
 */
export function countsFromAssigneeGroups(
  groups: Array<{ assignedToId: string | null; count: number }>,
  userId: string,
  awaiting: number
): ViewCounts {
  let all = 0, mine = 0, unassigned = 0;
  for (const group of groups) {
    all += group.count;
    if (group.assignedToId === null) unassigned += group.count;
    else if (group.assignedToId === userId) mine += group.count;
  }
  return { awaiting, mine, unassigned, all };
}

export async function getViewCounts(userId: string, accountIds: string[], channelAccountIds: string[]): Promise<ViewCounts> {
  // Mismos builders que la lista: "activos" es la vista `all` y "esperando",
  // la vista `awaiting` (que ya incluye a los activos).
  const active = parseChatListFilters(new URLSearchParams(`status=OPEN,PENDING&${VIEWS.all}`), userId);
  const awaitingFilters = parseChatListFilters(new URLSearchParams(`status=OPEN,PENDING&${VIEWS.awaiting}`), userId);
  const channelActive = channelAccountIds.length ? buildChannelChatWhere(active, channelAccountIds) : null;
  const channelAwaiting = channelAccountIds.length ? buildChannelChatWhere(awaitingFilters, channelAccountIds) : null;

  const [waGroups, channelGroups, waAwaiting, channelAwaitingCount] = await Promise.all([
    accountIds.length
      ? prisma.wAChat.groupBy({ by: ["assignedToId"], where: buildWaChatWhere(active, accountIds), _count: { _all: true } })
      : [],
    channelActive
      ? prisma.conversation.groupBy({ by: ["assignedToId"], where: channelActive, _count: { _all: true } })
      : [],
    accountIds.length ? prisma.wAChat.count({ where: buildWaChatWhere(awaitingFilters, accountIds) }) : 0,
    channelAwaiting ? prisma.conversation.count({ where: channelAwaiting }) : 0,
  ]);

  const groups = [...waGroups, ...channelGroups].map((group) => ({ assignedToId: group.assignedToId, count: group._count._all }));
  return countsFromAssigneeGroups(groups, userId, waAwaiting + channelAwaitingCount);
}

// R3 de docs/RENDIMIENTO_2026-11-04.md: los contadores cuestan 2 groupBy + 2 `count` y la
// bandeja los pide cada 30 s por pestaña. Se guardan 20 s por usuario ("Míos"
// depende de quién pregunta). Que un número tarde unos segundos en moverse tras
// una asignación es aceptable; la lista sí es inmediata. Si Redis falla, se
// calculan directo.
const COUNTS_TTL_SECONDS = 20;

export async function getViewCountsCached(userId: string, accountIds: string[], channelAccountIds: string[]): Promise<ViewCounts> {
  const key = `inbox:counts:${userId}`;
  const redis = getRedisClient();
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as ViewCounts;
  } catch {
    // sin caché: se calcula
  }
  const counts = await getViewCounts(userId, accountIds, channelAccountIds);
  await redis.set(key, JSON.stringify(counts), "EX", COUNTS_TTL_SECONDS).catch(() => {});
  return counts;
}
