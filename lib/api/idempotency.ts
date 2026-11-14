import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";
import { hashToken } from "@/lib/crypto";
import { ApiError, apiError, bodyOverflowed, guardRequestBody, withRequestScope } from "./respond";
import { isApiKeySecret } from "./keys";
import { IDEMPOTENCY_TTL_HOURS } from "./constants";

// Idempotency-Key en los POST de la API pública (envío de mensajes, alta de
// contactos, etiquetas, ejecuciones de automatizaciones). Un cliente que
// reintenta por un timeout manda el MISMO header y recibe la MISMA respuesta,
// sin que el mensaje salga dos veces.
//
//  - Alcance: organización + clave (dos integraciones de la misma cuenta
//    comparten espacio de claves, como en Stripe).
//  - Se guarda 24 h: huella del cuerpo (método + ruta + JSON canónico),
//    status y cuerpo de la respuesta.
//  - Misma clave con otro cuerpo → 422 idempotency_conflict.
//  - Misma clave mientras la primera sigue en curso → 409 conflict.
//  - No se guardan 401/402/403/429 ni 5xx: dependen del estado del momento
//    y el cliente debe poder reintentarlos.
//  - Si Redis no responde, la solicitud se procesa sin idempotencia (mejor
//    entregar que bloquear la API entera).

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const IDEMPOTENCY_TTL_SECONDS = IDEMPOTENCY_TTL_HOURS * 60 * 60;
const IN_FLIGHT_TTL_SECONDS = 60;
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;
const NOT_STORED = new Set([401, 402, 403, 413, 429]);
const REDIS_DOWN = new Set(["reconnecting", "close", "end"]);

type Stored =
  | { state: "pending"; fingerprint: string }
  | { state: "done"; fingerprint: string; status: number; body: string; contentType: string | null };

export function withIdempotency<A extends [Request, ...unknown[]]>(handler: (...args: A) => Promise<Response>) {
  return withRequestScope(async (...args: A): Promise<Response> => {
    const key = args[0].headers.get(IDEMPOTENCY_HEADER);
    if (key === null) return handler(...args);
    // El tope de cuerpo va antes de leerlo para la huella.
    try {
      args[0] = guardRequestBody(args[0]);
    } catch (err) {
      if (err instanceof ApiError) return apiError(err.status, err.code, err.message, err.headers);
      throw err;
    }
    const req = args[0];
    if (!KEY_PATTERN.test(key)) {
      return apiError(400, "invalid_request", "Idempotency-Key debe tener de 1 a 255 caracteres ASCII visibles (p. ej. un UUID)");
    }

    // Sin key válida no hay organización: el handler responde el 401.
    const organizationId = await organizationForBearer(req);
    if (!organizationId) return handler(...args);

    let fingerprint: string;
    try {
      fingerprint = await requestFingerprint(req);
    } catch (err) {
      if (bodyOverflowed(req)) return apiError(413, "payload_too_large", "El cuerpo supera el máximo permitido");
      throw err;
    }
    const storeKey = `idem:${organizationId}:${createHash("sha256").update(key).digest("hex")}`;

    let redis: ReturnType<typeof getRedisClient>;
    try {
      redis = getRedisClient();
      // Con Redis caído ioredis encola el comando sin fallar (maxRetriesPerRequest
      // null): el tope evita colgar la solicitud.
      if (REDIS_DOWN.has(redis.status)) throw new Error(`Redis en estado ${redis.status}`);
      const claimed = await redis.set(storeKey, JSON.stringify({ state: "pending", fingerprint } satisfies Stored), "EX", IN_FLIGHT_TTL_SECONDS, "NX");
      if (!claimed) {
        const stored = parseStored(await redis.get(storeKey));
        if (stored) return replay(stored, fingerprint);
        // Expiró entre el SET y el GET: se procesa como nueva.
        await redis.set(storeKey, JSON.stringify({ state: "pending", fingerprint } satisfies Stored), "EX", IN_FLIGHT_TTL_SECONDS);
      }
    } catch (err) {
      console.error("[api] Idempotency-Key sin Redis, se procesa sin guardar:", err instanceof Error ? err.message : err);
      return handler(...args);
    }

    let res: Response;
    try {
      res = await handler(...args);
    } catch (err) {
      await redis.del(storeKey).catch(() => {});
      throw err;
    }

    try {
      if (res.status >= 500 || NOT_STORED.has(res.status)) {
        await redis.del(storeKey);
      } else {
        const stored: Stored = { state: "done", fingerprint, status: res.status, body: await res.clone().text(), contentType: res.headers.get("content-type") };
        await redis.set(storeKey, JSON.stringify(stored), "EX", IDEMPOTENCY_TTL_SECONDS);
      }
    } catch (err) {
      console.error("[api] No se pudo guardar la respuesta idempotente:", err instanceof Error ? err.message : err);
    }
    return res;
  });
}

function replay(stored: Stored, fingerprint: string): Response {
  if (stored.fingerprint !== fingerprint) {
    return apiError(422, "idempotency_conflict", "Esta Idempotency-Key ya se usó con otro cuerpo o en otro endpoint. Usa una clave nueva para una solicitud distinta.");
  }
  if (stored.state === "pending") {
    return apiError(409, "conflict", "Una solicitud con esta Idempotency-Key sigue en proceso. Reintenta en unos segundos.");
  }
  return new Response(stored.body, {
    status: stored.status,
    headers: { ...(stored.contentType ? { "Content-Type": stored.contentType } : {}), "Idempotent-Replayed": "true" },
  });
}

function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Stored;
  } catch {
    return null;
  }
}

// Solo keys vigentes: una key revocada no debe poder releer respuestas.
async function organizationForBearer(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const secret = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!isApiKeySecret(secret)) return null;
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashToken(secret) },
    select: { organizationId: true, revokedAt: true, expiresAt: true },
  });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) return null;
  return key.organizationId;
}

// Método + ruta + cuerpo canónico (claves ordenadas): reordenar o reindentar
// el JSON no cuenta como "otro cuerpo".
export async function requestFingerprint(req: Request): Promise<string> {
  const raw = await req.clone().text();
  let canonical = raw;
  try {
    canonical = canonicalJson(JSON.parse(raw));
  } catch {
    // No es JSON: se compara el texto tal cual (el handler responderá 400).
  }
  return createHash("sha256").update(`${req.method} ${new URL(req.url).pathname}\n${canonical}`).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
