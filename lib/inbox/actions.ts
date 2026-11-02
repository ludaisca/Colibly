// Acciones sobre un chat que comparten el palette de comandos y los atajos de
// teclado de la bandeja. Solo `fetch` a las mismas rutas que usa la UI: no hay
// una segunda vía de mutación. Seguro para componentes cliente (sin Prisma).

async function patchChat<T>(chatId: string, path: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(`/api/whatsapp/chats/${chatId}/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? fallback);
  return data as T;
}

export function assignChatToMe(chatId: string) {
  return patchChat<{ assignedToId: string | null; assignedTo: { id: string; name: string | null } | null }>(
    chatId, "assign", { self: true }, "No se pudo asignar el chat"
  );
}

/** `userId: null` deja el chat sin asignar; la ruta valida que sea elegible. */
export function assignChatTo(chatId: string, userId: string | null) {
  return patchChat<{ assignedToId: string | null; assignedTo: { id: string; name: string | null } | null }>(
    chatId, "assign", { assignedToId: userId }, "No se pudo asignar el chat"
  );
}

export function resolveChat(chatId: string) {
  return patchChat<{ status: "OPEN" | "PENDING" | "RESOLVED" }>(chatId, "status", { status: "RESOLVED" }, "No se pudo resolver el chat");
}

export function snoozeChat(chatId: string, until: string | null) {
  return patchChat<{ snoozedUntil: string | null }>(chatId, "snooze", { until }, "No se pudo posponer el chat");
}

export function setChatPriority(chatId: string, priority: "LOW" | "NORMAL" | "HIGH" | "URGENT") {
  return patchChat<{ priority: string }>(chatId, "priority", { priority }, "No se pudo cambiar la prioridad");
}

export function oneHourFromNow(now = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}
