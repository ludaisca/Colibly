import { randomBytes } from "node:crypto";
import type { ApiKey } from "@prisma/client";
import { hashToken } from "@/lib/crypto";

// Formato: sk_live_<43 caracteres base64url> (256 bits); las de prueba,
// sk_test_ (lib/api/test-mode.ts). El prefijo visible permite reconocer la key
// en la lista sin guardar el secreto.
export const API_KEY_PREFIX = "sk_live_";
export const API_TEST_KEY_PREFIX = "sk_test_";

export function isApiKeySecret(secret: string): boolean {
  return secret.startsWith(API_KEY_PREFIX) || secret.startsWith(API_TEST_KEY_PREFIX);
}

export function generateApiKey(opts: { test?: boolean } = {}): { secret: string; prefix: string; keyHash: string } {
  const head = opts.test ? API_TEST_KEY_PREFIX : API_KEY_PREFIX;
  const secret = `${head}${randomBytes(32).toString("base64url")}`;
  return { secret, prefix: secret.slice(0, head.length + 6), keyHash: hashToken(secret) };
}

// Forma para la UI de configuración: nunca incluye keyHash.
export function serializeApiKey(k: ApiKey) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    test: k.test,
    accountIds: k.accountIds,
    channelAccountIds: k.channelAccountIds,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    revokedAt: k.revokedAt,
    createdAt: k.createdAt,
  };
}
