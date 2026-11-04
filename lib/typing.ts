import { getRedisClient } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

// Señal efímera de "está escribiendo". No se guarda en Postgres: si el
// proceso se reinicia, el peor caso es que el indicador desaparezca antes.
const TYPING_TTL_SECONDS = 10;
const TYPING_WINDOW_MS = 6_000;
const keyFor = (chatId: string) => `typing:${chatId}`;

export async function markTyping(chatId: string, userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = keyFor(chatId);
  const now = Date.now();
  await redis.zadd(key, now, userId);
  await redis.zremrangebyscore(key, 0, now - TYPING_WINDOW_MS);
  await redis.expire(key, TYPING_TTL_SECONDS);
}

export async function getTypingUserIds(chatId: string): Promise<string[]> {
  const redis = getRedisClient();
  const key = keyFor(chatId);
  const now = Date.now();
  await redis.zremrangebyscore(key, 0, now - TYPING_WINDOW_MS);
  return redis.zrangebyscore(key, now - TYPING_WINDOW_MS, "+inf");
}

/** Quién más está escribiendo en el chat (sin el propio usuario), con nombre. */
export async function getTypingUsers(chatId: string, selfId: string): Promise<Array<{ id: string; name: string | null }>> {
  const ids = (await getTypingUserIds(chatId)).filter((id) => id !== selfId);
  if (ids.length === 0) return [];
  return prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
}
