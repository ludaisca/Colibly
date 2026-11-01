import crypto from "crypto";
import { getRedisClient } from "@/lib/redis";

// Nonce de un solo uso para que la sesión que pidió "Cerrar las demás
// sesiones" adopte la nueva sessionVersion sin cerrarse ella misma. Solo se
// entrega en la respuesta de esa petición; dura 2 minutos.
const TTL_SECONDS = 120;
const key = (userId: string, nonce: string) => `session-nonce:${userId}:${nonce}`;

export async function createSessionNonce(userId: string, sessionVersion: number): Promise<string> {
  const nonce = crypto.randomBytes(24).toString("base64url");
  await getRedisClient().set(key(userId, nonce), String(sessionVersion), "EX", TTL_SECONDS);
  return nonce;
}

/** Devuelve la versión y borra el nonce (GETDEL atómico), o null si no existe. */
export async function consumeSessionNonce(userId: string, nonce: string): Promise<number | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return null;
  const value = await getRedisClient().getdel(key(userId, nonce));
  const version = value === null ? NaN : Number(value);
  return Number.isInteger(version) ? version : null;
}
