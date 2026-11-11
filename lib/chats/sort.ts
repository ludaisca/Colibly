// Orden de la lista de chats en memoria: el MISMO que chatListOrderBy
// (lib/chats/query.ts) aplica en la base. Puro y sin Prisma: lo usan el
// servidor (/api/inbox/sync) y la bandeja en el navegador al mezclar canales.

export interface ChatSortMode {
  /** Vista "Esperando": quien lleva más rato esperando primero. */
  awaiting?: boolean;
  /** "oldest" = último mensaje más viejo arriba. */
  sort?: "recent" | "oldest";
}

type Row = { id: string; waitingSince?: Date | string | null; lastMessageAt?: Date | string | null };

const time = (v: Date | string | null | undefined): number | null => (v ? new Date(v).getTime() : null);
// Ascendente con los nulos al final (igual que NULLS LAST en la base).
const asc = (a: number | null, b: number | null) => (a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : a - b);
const desc = (a: number | null, b: number | null) => (a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : b - a);

export function chatRowComparator(mode: ChatSortMode) {
  return (a: Row, b: Row): number => {
    if (mode.awaiting) return asc(time(a.waitingSince), time(b.waitingSince)) || asc(time(a.lastMessageAt), time(b.lastMessageAt)) || a.id.localeCompare(b.id);
    if (mode.sort === "oldest") return asc(time(a.lastMessageAt), time(b.lastMessageAt)) || a.id.localeCompare(b.id);
    return desc(time(a.lastMessageAt), time(b.lastMessageAt)) || b.id.localeCompare(a.id);
  };
}
