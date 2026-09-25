import { randomBytes } from "node:crypto";
import type { ApiKey } from "@prisma/client";
import { hashToken } from "@/lib/crypto";

// Formato: sk_live_<43 caracteres base64url> (256 bits). El prefijo visible
// permite reconocer la key en la lista sin guardar el secreto.
export const API_KEY_PREFIX = "sk_live_";

export function generateApiKey(): { secret: string; prefix: string; keyHash: string } {
  const secret = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { secret, prefix: secret.slice(0, API_KEY_PREFIX.length + 6), keyHash: hashToken(secret) };
}

// Forma para la UI de configuración: nunca incluye keyHash.
export function serializeApiKey(k: ApiKey) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    accountIds: k.accountIds,
    channelAccountIds: k.channelAccountIds,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    revokedAt: k.revokedAt,
    createdAt: k.createdAt,
  };
}
