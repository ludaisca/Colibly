import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { OAuthError, isValidRedirectUri, pkceChallenge, randomOAuthToken as randomToken } from "@/lib/oauth/common";
import { isPlatformScope, PLATFORM_SCOPES, type PlatformScope, type PlatformTokenContext } from "./scopes";

// OAuth 2.1 para el MCP remoto del operador: clientes públicos con PKCE S256,
// DCR y refresh con rotación. Los tokens son opacos (se consultan en BD) para
// que revocar sea inmediato, a diferencia de un JWT. Las piezas puras viven en
// lib/oauth/common.ts (las comparte el OAuth del MCP de clientes).

export { OAuthError, isValidRedirectUri, pkceChallenge };

export const OAUTH_ACCESS_PREFIX = "poa_";
export const OAUTH_REFRESH_PREFIX = "por_";
export const OAUTH_CODE_PREFIX = "pac_";
export const OAUTH_ACCESS_TTL_SECONDS = 60 * 60; // 1 h
export const OAUTH_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 días
export const OAUTH_CODE_TTL_SECONDS = 10 * 60; // 10 min

export function oauthIssuer(): string {
  return (process.env.APP_URL ?? "").replace(/\/+$/, "");
}

export function mcpResource(): string {
  return `${oauthIssuer()}/api/mcp`;
}

export function validateScopes(input: string[]): PlatformScope[] {
  const unique = [...new Set(input)];
  if (unique.some((scope) => !isPlatformScope(scope))) {
    throw new OAuthError(400, "invalid_scope", "Algún permiso no es válido");
  }
  return unique as PlatformScope[];
}

export async function registerOAuthClient(input: { clientName: string; redirectUris: string[] }) {
  const name = input.clientName.trim().slice(0, 120) || "Cliente MCP";
  const uris = [...new Set(input.redirectUris.map((uri) => uri.trim()).filter(Boolean))];
  if (uris.length === 0 || uris.length > 10) throw new OAuthError(400, "invalid_redirect_uri", "Envía entre 1 y 10 redirect URIs");
  if (uris.some((uri) => uri.length > 500 || !isValidRedirectUri(uri))) {
    throw new OAuthError(400, "invalid_redirect_uri", "Las redirect URIs deben ser https (o localhost en desarrollo)");
  }

  const clientId = `poc_${randomBytes(16).toString("hex")}`;
  const client = await prisma.platformOAuthClient.create({
    data: { clientId, clientName: name, redirectUris: uris },
    select: { clientId: true, clientName: true, redirectUris: true, grantTypes: true, scopes: true },
  });
  return client;
}

export async function getOAuthClient(clientId: string) {
  return prisma.platformOAuthClient.findUnique({ where: { clientId } });
}

export async function createAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  scopes: PlatformScope[];
  operatorEmail: string;
  codeChallenge: string;
  resource: string;
}) {
  const code = randomToken(OAUTH_CODE_PREFIX);
  await prisma.platformOAuthCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      scopes: input.scopes,
      operatorEmail: input.operatorEmail,
      codeChallenge: input.codeChallenge,
      resource: input.resource,
      expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_SECONDS * 1000),
    },
  });
  return code;
}

export interface OAuthTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: PlatformScope[];
}

async function issueTokens(input: {
  clientId: string;
  operatorEmail: string;
  scopes: PlatformScope[];
  resource: string;
  familyId?: string;
}): Promise<OAuthTokenPair> {
  const accessToken = randomToken(OAUTH_ACCESS_PREFIX);
  const refreshToken = randomToken(OAUTH_REFRESH_PREFIX);
  const familyId = input.familyId ?? randomUUID();
  await prisma.platformOAuthToken.create({
    data: {
      accessHash: hashToken(accessToken),
      refreshHash: hashToken(refreshToken),
      familyId,
      clientId: input.clientId,
      operatorEmail: input.operatorEmail,
      scopes: input.scopes,
      resource: input.resource,
      accessExpiresAt: new Date(Date.now() + OAUTH_ACCESS_TTL_SECONDS * 1000),
      refreshExpiresAt: new Date(Date.now() + OAUTH_REFRESH_TTL_SECONDS * 1000),
    },
  });
  return { accessToken, refreshToken, expiresIn: OAUTH_ACCESS_TTL_SECONDS, scopes: input.scopes };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<OAuthTokenPair> {
  const row = await prisma.platformOAuthCode.findUnique({ where: { codeHash: hashToken(input.code) } });
  if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) {
    throw new OAuthError(400, "invalid_grant", "El código no es válido o expiró");
  }
  if (row.clientId !== input.clientId) throw new OAuthError(400, "invalid_grant", "El código no pertenece a este cliente");
  if (row.redirectUri !== input.redirectUri) throw new OAuthError(400, "invalid_grant", "La redirect_uri no coincide");
  if (input.resource && row.resource && input.resource !== row.resource) {
    throw new OAuthError(400, "invalid_target", "El resource no coincide con el autorizado");
  }
  if (pkceChallenge(input.codeVerifier) !== row.codeChallenge) {
    throw new OAuthError(400, "invalid_grant", "PKCE no coincide");
  }

  // Un solo uso, incluso con dos peticiones simultáneas.
  const consumed = await prisma.platformOAuthCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) throw new OAuthError(400, "invalid_grant", "El código ya se usó");

  return issueTokens({
    clientId: row.clientId,
    operatorEmail: row.operatorEmail,
    scopes: row.scopes.filter(isPlatformScope),
    resource: row.resource ?? mcpResource(),
  });
}

export async function refreshOAuthTokens(input: { refreshToken: string; clientId: string }): Promise<OAuthTokenPair> {
  const row = await prisma.platformOAuthToken.findUnique({ where: { refreshHash: hashToken(input.refreshToken) } });
  if (!row) throw new OAuthError(400, "invalid_grant", "Refresh token no válido");
  if (row.clientId !== input.clientId) throw new OAuthError(400, "invalid_grant", "El refresh token no pertenece a este cliente");

  // Reuse detection: un refresh ya rotado que reaparece revoca toda la familia.
  if (row.revokedAt) {
    await revokeOAuthFamily(row.familyId);
    throw new OAuthError(400, "invalid_grant", "Refresh token reutilizado; se revocó la sesión");
  }
  if (!row.refreshExpiresAt || row.refreshExpiresAt.getTime() <= Date.now()) {
    throw new OAuthError(400, "invalid_grant", "El refresh token expiró");
  }

  await prisma.platformOAuthToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return issueTokens({
    clientId: row.clientId,
    operatorEmail: row.operatorEmail,
    scopes: row.scopes.filter(isPlatformScope),
    resource: row.resource ?? mcpResource(),
    familyId: row.familyId,
  });
}

async function revokeOAuthFamily(familyId: string): Promise<void> {
  await prisma.platformOAuthToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeOAuthToken(raw: string): Promise<boolean> {
  const hash = hashToken(raw);
  const row = await prisma.platformOAuthToken.findFirst({
    where: { OR: [{ accessHash: hash }, { refreshHash: hash }] },
    select: { id: true, familyId: true },
  });
  if (!row) return false;
  await revokeOAuthFamily(row.familyId);
  return true;
}

export async function authenticateOAuthAccessToken(
  raw: string,
  scope: PlatformScope | null,
  _ip: string
): Promise<PlatformTokenContext | NextResponse> {
  const row = await prisma.platformOAuthToken.findUnique({ where: { accessHash: hashToken(raw) } });
  if (!row || row.revokedAt) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Token OAuth no válido" } }, { status: 401 });
  }
  if (row.accessExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: { code: "unauthorized", message: "El access token expiró" } }, { status: 401 });
  }
  if (row.resource && row.resource !== mcpResource()) {
    return NextResponse.json({ error: { code: "invalid_target", message: "El token es para otro resource" } }, { status: 401 });
  }

  const limit = await rateLimit(`platform-oauth:${row.id}`, 30, 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Límite de 30 solicitudes por minuto excedido" } }, { status: 429 });
  }

  const scopes = row.scopes.filter(isPlatformScope);
  if (scope && !scopes.includes(scope)) {
    return NextResponse.json({ error: { code: "forbidden", message: `El token no tiene el permiso ${scope}` } }, { status: 403 });
  }

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.platformOAuthToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }

  return {
    tokenId: row.id,
    scopes,
    actorEmail: row.operatorEmail,
    environment: process.env.NODE_ENV === "production" ? "production" : "dev",
  };
}

export function oauthScopesSupported(): string[] {
  return [...PLATFORM_SCOPES];
}
