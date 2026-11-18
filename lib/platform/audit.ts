import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLATFORM_SECRET_FIELDS } from "@/lib/platform-settings";

// Auditoría de la operación de plataforma. Nunca lanza: si el log falla, la
// acción ya ocurrió y solo se pierde la evidencia (se avisa en consola).
// Los valores de secretos se redactan SIEMPRE, aunque el llamador los pase.

const SECRET_FIELDS = new Set<string>(PLATFORM_SECRET_FIELDS);
const SECRET_LIKE = /(secret|password|passphrase|api_?key|private_?key)$/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (value === null || value === undefined) return value;
  // Un Date es un objeto sin propiedades propias: sin esto quedaba como {}.
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELDS.has(key) || SECRET_LIKE.test(key)) {
        out[key] = item ? "[set]" : "[empty]";
        continue;
      }
      out[key] = redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

export interface PlatformAuditInput {
  actor: {
    type: "user" | "token" | "system";
    email?: string | null;
    tokenId?: string | null;
  };
  action: string;
  target?: { type: string; id: string };
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ip?: string | null;
}

export async function logPlatformAction(input: PlatformAuditInput): Promise<void> {
  try {
    const before = input.before === undefined ? undefined : (redact(input.before) as Prisma.InputJsonValue);
    const after = input.after === undefined ? undefined : (redact(input.after) as Prisma.InputJsonValue);
    await prisma.platformAuditLog.create({
      data: {
        actorType: input.actor.type,
        actorEmail: input.actor.email ?? null,
        tokenId: input.actor.tokenId ?? null,
        action: input.action,
        targetType: input.target?.type ?? null,
        targetId: input.target?.id ?? null,
        before,
        after,
        ip: input.ip ?? null,
        requestId: input.requestId ?? null,
      },
    });
  } catch (error) {
    console.error("[plataforma] no se pudo escribir la auditoría:", error instanceof Error ? error.message : error);
  }
}

// Borra la auditoría más vieja que la retención (90 días por decisión de
// producto). Se llama desde el tick diario de platform-health.
export const PLATFORM_AUDIT_RETENTION_DAYS = 90;

export async function purgePlatformAudit(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PLATFORM_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.platformAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}
