import { getRedisClient } from "@/lib/redis";

const memoryStore = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /**
   * true = si Redis no está disponible lanza RateLimitUnavailableError en vez
   * de contar en memoria. La API pública lo usa: con varias instancias, el
   * conteo en memoria es por proceso y el límite real se multiplicaría.
   */
  failClosed?: boolean;
}

// Redis no respondió (caído, sin conexión o lento): el llamador decide (la API
// pública responde 503 con Retry-After).
export class RateLimitUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("El limitador de velocidad no está disponible");
    this.name = "RateLimitUnavailableError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

// ioredis se crea con maxRetriesPerRequest: null (lo exige BullMQ), así que con
// Redis caído un comando se queda en la cola offline para siempre en vez de
// fallar. Sin este tope, "Redis caído" colgaba la solicitud en lugar de caer
// al respaldo.
const REDIS_TIMEOUT_MS = 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis no respondió en ${ms} ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// Ventana deslizante (sorted set de timestamps). Cuenta también las
// solicitudes rechazadas: reintentar antes de Retry-After vuelve a contar.
export async function rateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const fullKey = `ratelimit:${key}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  try {
    const r = getRedisClient();
    // Sin conexión lista: no encolar el comando (fallaría tarde o nunca).
    if (r.status !== "ready" && r.status !== "connecting" && r.status !== "connect") {
      throw new Error(`Redis en estado ${r.status}`);
    }

    const multi = r.multi();
    multi.zremrangebyscore(fullKey, 0, windowStart);
    multi.zcard(fullKey);
    // El más viejo dentro de la ventana: cuando sale, se libera un lugar.
    multi.zrange(fullKey, 0, 0, "WITHSCORES");
    multi.zadd(fullKey, now, `${now}_${Math.random()}`);
    multi.expire(fullKey, windowSeconds + 1);

    const results = await withTimeout(multi.exec(), REDIS_TIMEOUT_MS);
    if (!results) throw new Error("Transacción de Redis abortada");
    const [, current, oldest] = results;
    if (current?.[0]) throw current[0];
    const count = (current?.[1] as number) || 0;
    const oldestScore = Number((oldest?.[1] as string[] | undefined)?.[1] ?? now);
    return { allowed: count < maxRequests, remaining: Math.max(0, maxRequests - count - 1), resetAt: (Number.isFinite(oldestScore) ? oldestScore : now) + windowSeconds * 1000 };
  } catch (err) {
    if (options.failClosed) throw new RateLimitUnavailableError(err);
    // Poda de claves muertas: sin esto, con Redis caído un rato el Map crece
    // sin límite (una entrada por IP/usuario que jamás se libera).
    if (memoryStore.size > 500) {
      for (const [key, ts] of memoryStore) {
        if (ts.every((t) => t <= windowStart)) memoryStore.delete(key);
      }
    }
    const timestamps = memoryStore.get(fullKey) ?? [];
    const valid = timestamps.filter((t) => t > windowStart);
    valid.push(now);
    memoryStore.set(fullKey, valid);
    return { allowed: valid.length <= maxRequests, remaining: Math.max(0, maxRequests - valid.length), resetAt: valid[0] + windowSeconds * 1000 };
  }
}

/** Fin del día UTC actual, en epoch ms. */
export function endOfUtcDay(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

// Cupo diario (día UTC) con INCR atómico. Siempre fail-closed: es un tope de
// negocio, no tiene sentido contarlo en memoria por proceso. Si ya se pasó, el
// intento no consume (DECR) para que el contador refleje lo realmente usado.
export async function consumeDailyQuota(key: string, max: number, now = Date.now()): Promise<RateLimitResult & { used: number }> {
  const day = new Date(now).toISOString().slice(0, 10);
  const fullKey = `quota:${key}:${day}`;
  const resetAt = endOfUtcDay(now);
  try {
    const r = getRedisClient();
    if (r.status !== "ready" && r.status !== "connecting" && r.status !== "connect") {
      throw new Error(`Redis en estado ${r.status}`);
    }
    const results = await withTimeout(r.multi().incr(fullKey).expire(fullKey, 2 * 24 * 60 * 60).exec(), REDIS_TIMEOUT_MS);
    if (!results || results[0]?.[0]) throw results?.[0]?.[0] ?? new Error("Transacción de Redis abortada");
    const used = Number(results[0][1]);
    if (used > max) {
      await withTimeout(r.decr(fullKey), REDIS_TIMEOUT_MS).catch(() => {});
      return { allowed: false, remaining: 0, resetAt, used: max };
    }
    return { allowed: true, remaining: Math.max(0, max - used), resetAt, used };
  } catch (err) {
    throw new RateLimitUnavailableError(err);
  }
}

/** Devuelve un lugar del cupo diario (p. ej. si el envío falló antes de salir). */
export async function refundDailyQuota(key: string, now = Date.now()): Promise<void> {
  const day = new Date(now).toISOString().slice(0, 10);
  try {
    await withTimeout(getRedisClient().decr(`quota:${key}:${day}`), REDIS_TIMEOUT_MS);
  } catch {
    // mejor esfuerzo
  }
}
