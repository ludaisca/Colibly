import { randomBytes, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/crypto";
import { appUrl } from "@/lib/app-url";
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";
import { generateApiKey } from "@/lib/api/keys";
import { apiKeyCapExceeded } from "@/lib/api/limits";
import { invalidateApiKeyCache } from "@/lib/api/auth-cache";
import { integrationOwnerHas } from "@/lib/billing/entitlements";
import { OAuthError, isValidCodeChallenge, isValidPublicClientRedirectUri, pkceChallenge, randomOAuthToken } from "@/lib/oauth/common";
import { CUSTOMER_TOOLS } from "./tools";

// OAuth 2.1 del MCP de clientes (/api/v1/mcp): lo que permite pegar la URL en
// Claude.ai, ChatGPT o Claude Desktop e iniciar sesión, sin manejar keys.
//
// Clientes públicos (registro dinámico, PKCE S256, sin secreto). Un admin con
// licencia Pro autoriza y elige permisos; al canjear el código se crea una
// ApiKey (oauthClientId) con esos permisos cuyo secreto nadie conoce. Los
// tokens apuntan a esa key: el MCP la ata a cada llamada (lib/api/bound-key.ts)
// y todo lo demás — alcance, licencia, solo lectura, límites, sk_test — es la
// API de siempre. Revocar la key en Configuración → API corta la conexión.
//
// Separado del OAuth del operador (lib/platform/oauth.ts): otro emisor, otras
// tablas, otros prefijos. Detalle: docs/arquitectura/integraciones.md.

export const MCP_OAUTH_CLIENT_PREFIX = "mcc_";
export const MCP_OAUTH_CODE_PREFIX = "mca_";
export const MCP_OAUTH_ACCESS_PREFIX = "mco_";
export const MCP_OAUTH_REFRESH_PREFIX = "mcr_";
export const MCP_OAUTH_ACCESS_TTL_SECONDS = 60 * 60; // 1 h
export const MCP_OAUTH_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 días sin uso
export const MCP_OAUTH_CODE_TTL_SECONDS = 10 * 60;

/** Emisor (RFC 8414 con ruta): metadatos en /.well-known/oauth-authorization-server/oauth. */
export function customerOAuthIssuer(): string {
  return appUrl("/oauth");
}

export function customerMcpResource(): string {
  return appUrl("/api/v1/mcp");
}

/** Metadatos del recurso protegido (RFC 9728), con la ruta del MCP insertada. */
export function customerResourceMetadataUrl(): string {
  return appUrl("/.well-known/oauth-protected-resource/api/v1/mcp");
}

export function customerOAuthMetadata() {
  const issuer = customerOAuthIssuer();
  return {
    issuer,
    authorization_endpoint: appUrl("/oauth/autorizar"),
    token_endpoint: appUrl("/api/oauth/token"),
    registration_endpoint: appUrl("/api/oauth/register"),
    revocation_endpoint: appUrl("/api/oauth/revoke"),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    service_documentation: appUrl("/docs/mcp"),
  };
}

export function customerResourceMetadata() {
  return {
    resource: customerMcpResource(),
    authorization_servers: [customerOAuthIssuer()],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "MCP de clientes",
    resource_documentation: appUrl("/docs/mcp"),
  };
}

/** Permisos que usa alguna herramienta del MCP, en el orden de API_SCOPES. */
export const MCP_OAUTH_SCOPES: readonly ApiScope[] = (Object.keys(API_SCOPES) as ApiScope[]).filter((scope) =>
  CUSTOMER_TOOLS.some((tool) => tool.scope === scope)
);

/** Los que envían mensajes a clientes: en el consentimiento van aparte. */
export const MCP_OAUTH_SENDING_SCOPES: readonly ApiScope[] = MCP_OAUTH_SCOPES.filter((scope) =>
  CUSTOMER_TOOLS.some((tool) => tool.scope === scope && tool.irreversible)
);

/**
 * `scope` pedido por el cliente → permisos del MCP (descarta los que no
 * existen o no usa el MCP). Sin `scope`, todos. Pura.
 */
export function requestedMcpScopes(raw: string | null | undefined): ApiScope[] {
  const asked = (raw ?? "").split(/\s+/).filter(Boolean);
  if (asked.length === 0) return [...MCP_OAUTH_SCOPES];
  const picked = MCP_OAUTH_SCOPES.filter((scope) => asked.includes(scope));
  return picked.length > 0 ? picked : [...MCP_OAUTH_SCOPES];
}

/** El mismo recurso, con o sin barra final. Sin `resource` (clientes viejos) vale el del MCP. Pura. */
export function isCustomerMcpResource(resource: string | null | undefined): boolean {
  if (!resource) return true;
  return resource.replace(/\/+$/, "") === customerMcpResource();
}

// --- Registro dinámico (RFC 7591) -----------------------------------------

export async function registerMcpClient(input: { clientName: string; redirectUris: string[] }) {
  const name = input.clientName.trim().slice(0, 80) || "Cliente MCP";
  const uris = [...new Set(input.redirectUris.map((uri) => uri.trim()).filter(Boolean))];
  if (uris.length === 0 || uris.length > 10) throw new OAuthError(400, "invalid_redirect_uri", "Envía entre 1 y 10 redirect URIs");
  if (uris.some((uri) => uri.length > 500 || !isValidPublicClientRedirectUri(uri))) {
    throw new OAuthError(400, "invalid_redirect_uri", "Cada redirect URI debe ser https, http en localhost o el esquema propio de una app");
  }
  return prisma.mcpOAuthClient.create({
    data: { clientId: `${MCP_OAUTH_CLIENT_PREFIX}${randomBytes(16).toString("hex")}`, clientName: name, redirectUris: uris },
    select: { clientId: true, clientName: true, redirectUris: true, createdAt: true },
  });
}

// --- Autorización -----------------------------------------------------------

export interface AuthorizeRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: ApiScope[];
  resource: string;
  state: string | null;
}

type Params = { get(name: string): string | null };

/**
 * Valida una solicitud de /oauth/autorizar. Lanza OAuthError; `redirectable`
 * dice si el error puede volver al cliente (client_id y redirect_uri ya son
 * confiables) o si hay que mostrarlo en la página (RFC 6749 §4.1.2.1).
 */
export async function validateAuthorizeRequest(params: Params): Promise<AuthorizeRequest> {
  const clientId = params.get("client_id");
  if (!clientId) throw new OAuthError(400, "invalid_request", "Falta client_id");
  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId } });
  if (!client) throw new OAuthError(400, "invalid_client", "Esta aplicación no está registrada. Vuelve a conectarla desde tu asistente.");
  const redirectUri = params.get("redirect_uri");
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    throw new OAuthError(400, "invalid_request", "La dirección de regreso no corresponde a esta aplicación.");
  }

  const fail = (code: string, message: string) => Object.assign(new OAuthError(400, code, message), { redirectUri, state: params.get("state") });
  if (params.get("response_type") !== "code") throw fail("unsupported_response_type", "response_type debe ser code");
  if (params.get("code_challenge_method") !== "S256") throw fail("invalid_request", "PKCE S256 es obligatorio");
  const codeChallenge = params.get("code_challenge");
  if (!isValidCodeChallenge(codeChallenge)) throw fail("invalid_request", "code_challenge inválido");
  const resource = params.get("resource");
  if (!isCustomerMcpResource(resource)) throw fail("invalid_target", "Este servidor solo autoriza el MCP de clientes");

  return {
    clientId,
    clientName: client.clientName,
    redirectUri,
    codeChallenge,
    scopes: requestedMcpScopes(params.get("scope")),
    resource: customerMcpResource(),
    state: params.get("state"),
  };
}

/** Error de validación que puede volver al cliente por su redirect_uri. */
export function redirectableError(error: unknown): { redirectUri: string; state: string | null; code: string; message: string } | null {
  if (!(error instanceof OAuthError)) return null;
  const extra = error as OAuthError & { redirectUri?: string; state?: string | null };
  return extra.redirectUri ? { redirectUri: extra.redirectUri, state: extra.state ?? null, code: error.code, message: error.message } : null;
}

/** Por qué este usuario no puede conectar el MCP (null = puede). */
export async function connectBlockReason(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, disabledAt: true } });
  if (!user || user.disabledAt) return "Tu cuenta no está activa.";
  if (user.role !== "admin") return "Solo un administrador puede conectar un asistente. Pídeselo a quien administra tu cuenta.";
  if (!(await integrationOwnerHas(userId, "api"))) return "Conectar un asistente requiere la licencia Pro (la misma que la API).";
  return null;
}

export async function createMcpAuthorizationCode(input: {
  request: AuthorizeRequest;
  userId: string;
  scopes: ApiScope[];
  test: boolean;
}): Promise<string> {
  const code = randomOAuthToken(MCP_OAUTH_CODE_PREFIX);
  await prisma.mcpOAuthCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: input.request.clientId,
      redirectUri: input.request.redirectUri,
      codeChallenge: input.request.codeChallenge,
      resource: input.request.resource,
      userId: input.userId,
      scopes: input.scopes,
      test: input.test,
      expiresAt: new Date(Date.now() + MCP_OAUTH_CODE_TTL_SECONDS * 1000),
    },
  });
  return code;
}

// --- Tokens -----------------------------------------------------------------

export interface McpTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
}

async function issueTokens(input: { clientId: string; apiKeyId: string; scopes: string[]; resource: string; familyId?: string }): Promise<McpTokenPair> {
  const accessToken = randomOAuthToken(MCP_OAUTH_ACCESS_PREFIX);
  const refreshToken = randomOAuthToken(MCP_OAUTH_REFRESH_PREFIX);
  await prisma.mcpOAuthToken.create({
    data: {
      accessHash: hashToken(accessToken),
      refreshHash: hashToken(refreshToken),
      familyId: input.familyId ?? randomUUID(),
      clientId: input.clientId,
      apiKeyId: input.apiKeyId,
      resource: input.resource,
      accessExpiresAt: new Date(Date.now() + MCP_OAUTH_ACCESS_TTL_SECONDS * 1000),
      refreshExpiresAt: new Date(Date.now() + MCP_OAUTH_REFRESH_TTL_SECONDS * 1000),
    },
  });
  return { accessToken, refreshToken, expiresIn: MCP_OAUTH_ACCESS_TTL_SECONDS, scopes: input.scopes };
}

/** Revoca las keys de OAuth (y sus tokens) y corta su caché de autenticación. */
async function revokeOAuthKeys(where: { id?: string; userId?: string; oauthClientId?: string }): Promise<void> {
  const keys = await prisma.apiKey.findMany({
    where: { ...where, oauthClientId: where.oauthClientId ?? { not: null }, revokedAt: null },
    select: { id: true, keyHash: true },
  });
  if (keys.length === 0) return;
  const ids = keys.map((k) => k.id);
  const now = new Date();
  await prisma.$transaction([
    prisma.apiKey.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now } }),
    prisma.mcpOAuthToken.updateMany({ where: { apiKeyId: { in: ids }, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  await Promise.all(keys.map((k) => invalidateApiKeyCache(k.keyHash)));
}

export async function exchangeMcpAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<McpTokenPair> {
  const row = await prisma.mcpOAuthCode.findUnique({ where: { codeHash: hashToken(input.code) } });
  if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) throw new OAuthError(400, "invalid_grant", "El código no es válido o expiró");
  if (row.clientId !== input.clientId) throw new OAuthError(400, "invalid_grant", "El código no pertenece a este cliente");
  if (row.redirectUri !== input.redirectUri) throw new OAuthError(400, "invalid_grant", "La redirect_uri no coincide");
  if (input.resource && !isCustomerMcpResource(input.resource)) throw new OAuthError(400, "invalid_target", "El resource no coincide con el autorizado");
  if (pkceChallenge(input.codeVerifier) !== row.codeChallenge) throw new OAuthError(400, "invalid_grant", "PKCE no coincide");

  // Un solo uso, incluso con dos canjes simultáneos.
  const consumed = await prisma.mcpOAuthCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count === 0) throw new OAuthError(400, "invalid_grant", "El código ya se usó");

  // Lo que valía al autorizar se vuelve a comprobar al crear la key.
  const blocked = await connectBlockReason(row.userId);
  if (blocked) throw new OAuthError(400, "invalid_grant", blocked);
  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { organizationId: true } });
  if (!user?.organizationId) throw new OAuthError(400, "invalid_grant", "La cuenta no tiene organización");
  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId: row.clientId }, select: { clientName: true } });

  // Reconectar la misma app reemplaza la conexión anterior (no se acumulan keys).
  await revokeOAuthKeys({ userId: row.userId, oauthClientId: row.clientId });
  const cap = await apiKeyCapExceeded(user.organizationId);
  if (cap) throw new OAuthError(400, "invalid_grant", cap.message);

  // El secreto se descarta: la key solo se usa atada por el MCP.
  const { prefix, keyHash } = generateApiKey({ test: row.test });
  const key = await prisma.apiKey.create({
    data: {
      userId: row.userId,
      organizationId: user.organizationId,
      name: `${client?.clientName ?? "Asistente"} (MCP)`.slice(0, 80),
      prefix,
      keyHash,
      scopes: row.scopes,
      test: row.test,
      oauthClientId: row.clientId,
    },
    select: { id: true },
  });
  console.log(`[mcp-oauth] ${row.userId} conectó ${row.clientId} → key ${key.id} (${row.scopes.join(" ")}${row.test ? ", prueba" : ""})`);
  return issueTokens({ clientId: row.clientId, apiKeyId: key.id, scopes: row.scopes, resource: row.resource });
}

export async function refreshMcpTokens(input: { refreshToken: string; clientId: string }): Promise<McpTokenPair> {
  const row = await prisma.mcpOAuthToken.findUnique({
    where: { refreshHash: hashToken(input.refreshToken) },
    include: { apiKey: { select: { scopes: true, revokedAt: true } } },
  });
  if (!row) throw new OAuthError(400, "invalid_grant", "Refresh token no válido");
  if (row.clientId !== input.clientId) throw new OAuthError(400, "invalid_grant", "El refresh token no pertenece a este cliente");
  // Un refresh ya rotado que reaparece: alguien lo copió. Se corta la conexión.
  if (row.revokedAt) {
    if (!row.apiKey.revokedAt) await revokeOAuthKeys({ id: row.apiKeyId });
    throw new OAuthError(400, "invalid_grant", "Refresh token reutilizado; se cerró la conexión");
  }
  if (row.apiKey.revokedAt) throw new OAuthError(400, "invalid_grant", "La conexión se revocó en Configuración → API");
  if (row.refreshExpiresAt.getTime() <= Date.now()) throw new OAuthError(400, "invalid_grant", "El refresh token expiró");

  const rotated = await prisma.mcpOAuthToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (rotated.count === 0) throw new OAuthError(400, "invalid_grant", "El refresh token ya se usó");
  return issueTokens({ clientId: row.clientId, apiKeyId: row.apiKeyId, scopes: row.apiKey.scopes, resource: row.resource, familyId: row.familyId });
}

/** RFC 7009: revocar cualquiera de los dos tokens desconecta la app (revoca su key). */
export async function revokeMcpToken(raw: string): Promise<void> {
  const hash = hashToken(raw);
  const row = await prisma.mcpOAuthToken.findFirst({ where: { OR: [{ accessHash: hash }, { refreshHash: hash }] }, select: { apiKeyId: true } });
  if (row) await revokeOAuthKeys({ id: row.apiKeyId });
}

export function isMcpAccessToken(raw: string): boolean {
  return raw.startsWith(MCP_OAUTH_ACCESS_PREFIX);
}

/**
 * Access token → hash de la key que respalda la conexión, o null si no vale.
 * Lo demás (key revocada, dueño sin licencia, límites) lo decide
 * authenticateApiKey con esa key.
 */
export async function resolveMcpAccessToken(raw: string): Promise<{ keyHash: string } | null> {
  const row = await prisma.mcpOAuthToken.findUnique({
    where: { accessHash: hashToken(raw) },
    select: { revokedAt: true, accessExpiresAt: true, resource: true, apiKey: { select: { keyHash: true } } },
  });
  if (!row || row.revokedAt || row.accessExpiresAt.getTime() <= Date.now()) return null;
  if (!isCustomerMcpResource(row.resource)) return null;
  return { keyHash: row.apiKey.keyHash };
}

/**
 * Limpieza diaria: códigos vencidos, tokens que ya no pueden refrescarse y las
 * keys de conexiones que quedaron sin ningún token vivo (la app dejó de usarse
 * 30 días: para volver, se reconecta).
 */
export async function purgeExpiredMcpOAuth(now = new Date()): Promise<{ codes: number; tokens: number; connections: number }> {
  const [codes, tokens] = await Promise.all([
    prisma.mcpOAuthCode.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.mcpOAuthToken.deleteMany({ where: { refreshExpiresAt: { lt: now } } }),
  ]);
  const dead = await prisma.apiKey.findMany({
    where: {
      oauthClientId: { not: null },
      revokedAt: null,
      createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      mcpOAuthTokens: { none: { revokedAt: null, refreshExpiresAt: { gt: now } } },
    },
    select: { id: true },
    take: 500,
  });
  for (const key of dead) await revokeOAuthKeys({ id: key.id });
  return { codes: codes.count, tokens: tokens.count, connections: dead.length };
}
