import { prisma } from "@/lib/prisma";
import { HEARTBEAT_MIN_INTERVAL_MS, filterAssignableCandidates } from "./availability-rules";

export * from "./availability-rules";

/**
 * Latido sin websockets: lo llama el poll de notificaciones (cada ~25 s). El
 * `updateMany` condicionado limita a una escritura por minuto. Nunca lanza.
 */
export async function touchLastSeen(userId: string, now = new Date()): Promise<void> {
  try {
    await prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - HEARTBEAT_MIN_INTERVAL_MS) } }],
      },
      data: { lastSeenAt: now },
    });
  } catch (error) {
    console.error("[presence] no se pudo actualizar lastSeenAt", error);
  }
}

/** Ids de candidatos que pueden recibir un chat según el interruptor de la cuenta. */
export async function assignableCandidateIds(candidateIds: string[], onlineOnly: boolean, now = Date.now()): Promise<string[]> {
  if (!onlineOnly || candidateIds.length === 0) return candidateIds;
  const users = await prisma.user.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, availability: true, lastSeenAt: true },
  });
  const allowed = new Set(filterAssignableCandidates(users, true, now));
  // Conserva el orden original de candidatos.
  return candidateIds.filter((id) => allowed.has(id));
}
