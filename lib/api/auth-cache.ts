import { getRedisClient } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { API_AUTH_CACHE_SECONDS } from "./constants";

// Caché en Redis (compartido entre instancias) de lo que la API pública
// consulta en CADA solicitud: la key con su dueño, el acceso del plan de la
// organización y el alcance resuelto (cuentas del dueño ∩ recorte de la key).
//
// Invalidación explícita (inmediata en todas las instancias):
//  - key revocada / renombrada / borrada  → invalidateApiKeyCache(keyHash)
//  - dueño degradado o desactivado        → invalidateApiKeysOfUser(userId)
//  - cambio de plan o de estado de pago   → invalidateOrgApiAccess(orgId)
//    (enganchado en invalidateOrgBilling, que ya llaman Stripe, el tick y /plataforma)
// Lo demás (p. ej. le quitan una cuenta compartida al dueño) caduca solo en
// API_AUTH_CACHE_SECONDS. Si Redis falla, se lee de la base sin caché.

const TIMEOUT_MS = 500;

const keyCacheKey = (keyHash: string) => `apicache:key:${keyHash}`;
const orgCacheKey = (organizationId: string) => `apicache:org:${organizationId}`;

function redisOrNull() {
  try {
    const r = getRedisClient();
    return r.status === "ready" ? r : null;
  } catch {
    return null;
  }
}

function timeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
}

async function readJson<T>(key: string): Promise<T | null> {
  const r = redisOrNull();
  if (!r) return null;
  try {
    const raw = await timeout(r.get(key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const r = redisOrNull();
  if (!r) return;
  await timeout(r.set(key, JSON.stringify(value), "EX", API_AUTH_CACHE_SECONDS)).catch(() => {});
}

async function del(...keys: string[]): Promise<void> {
  // En tests unitarios no hay Redis: no abrir una conexión que solo falla.
  if (keys.length === 0 || process.env.NODE_ENV === "test") return;
  try {
    // Aquí sí se espera aunque no esté "ready": una invalidación perdida
    // dejaría viva una key revocada hasta que caduque.
    await timeout(getRedisClient().del(...keys));
  } catch {
    // mejor esfuerzo: el TTL corto es el respaldo
  }
}

// ── Key + dueño + alcance ──

export interface CachedApiKey {
  id: string;
  userId: string;
  organizationId: string;
  scopes: string[];
  accountIds: string[];
  channelAccountIds: string[];
  revokedAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  user: { role: string; disabledAt: string | null };
  /** Alcance resuelto; se llena tras la primera solicitud autenticada. */
  resolved?: { accountIds: string[]; channelAccountIds: string[] };
}

export async function getCachedApiKey(keyHash: string): Promise<CachedApiKey | null> {
  return readJson<CachedApiKey>(keyCacheKey(keyHash));
}

export async function setCachedApiKey(keyHash: string, value: CachedApiKey): Promise<void> {
  await writeJson(keyCacheKey(keyHash), value);
}

export async function invalidateApiKeyCache(keyHash: string): Promise<void> {
  await del(keyCacheKey(keyHash));
}

export async function invalidateApiKeysOfUser(userId: string): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  try {
    const keys = await prisma.apiKey.findMany({ where: { userId }, select: { keyHash: true } });
    await del(...keys.map((k) => keyCacheKey(k.keyHash)));
  } catch {
    // mejor esfuerzo: el TTL corto es el respaldo
  }
}

// ── Acceso del plan ──

export interface CachedOrgAccess {
  apiAccess: boolean;
  writable: boolean;
}

export async function getCachedOrgAccess(organizationId: string): Promise<CachedOrgAccess | null> {
  return readJson<CachedOrgAccess>(orgCacheKey(organizationId));
}

export async function setCachedOrgAccess(organizationId: string, value: CachedOrgAccess): Promise<void> {
  await writeJson(orgCacheKey(organizationId), value);
}

export async function invalidateOrgApiAccess(organizationId: string): Promise<void> {
  await del(orgCacheKey(organizationId));
}
