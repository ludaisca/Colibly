import { describe, expect, it, vi } from "vitest";

// oauth.ts importa Prisma, Redis y facturación: aquí solo se prueban sus
// funciones puras.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/api/auth-cache", () => ({ invalidateApiKeyCache: vi.fn() }));
vi.mock("@/lib/api/limits", () => ({ apiKeyCapExceeded: vi.fn() }));
vi.mock("@/lib/billing/entitlements", () => ({ integrationOwnerHas: vi.fn() }));

process.env.APP_URL = "https://app.ejemplo.test";

const {
  MCP_OAUTH_SCOPES,
  MCP_OAUTH_SENDING_SCOPES,
  customerOAuthMetadata,
  customerResourceMetadata,
  customerResourceMetadataUrl,
  isCustomerMcpResource,
  isMcpAccessToken,
  requestedMcpScopes,
  redirectableError,
} = await import("../oauth");
const { OAuthError, isValidCodeChallenge, isValidPublicClientRedirectUri } = await import("@/lib/oauth/common");

describe("permisos del MCP", () => {
  it("solo los que usa alguna herramienta; los de envío aparte", () => {
    expect(MCP_OAUTH_SCOPES).toEqual(["contacts:read", "contacts:write", "conversations:read", "conversations:write", "messages:send", "automations:run"]);
    expect(MCP_OAUTH_SENDING_SCOPES).toEqual(["messages:send", "automations:run"]);
  });

  it("scope pedido: se filtra a los del MCP; vacío o desconocido = todos", () => {
    expect(requestedMcpScopes("contacts:read webhooks:manage")).toEqual(["contacts:read"]);
    expect(requestedMcpScopes(null)).toEqual([...MCP_OAUTH_SCOPES]);
    expect(requestedMcpScopes("openid profile")).toEqual([...MCP_OAUTH_SCOPES]);
  });
});

describe("descubrimiento", () => {
  it("emisor con ruta y recurso del MCP de clientes", () => {
    const as = customerOAuthMetadata();
    expect(as.issuer).toBe("https://app.ejemplo.test/oauth");
    expect(as.authorization_endpoint).toBe("https://app.ejemplo.test/oauth/autorizar");
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
    const prm = customerResourceMetadata();
    expect(prm.resource).toBe("https://app.ejemplo.test/api/v1/mcp");
    expect(prm.authorization_servers).toEqual([as.issuer]);
    expect(customerResourceMetadataUrl()).toBe("https://app.ejemplo.test/.well-known/oauth-protected-resource/api/v1/mcp");
  });

  it("resource: el del MCP (con o sin barra) o ninguno; nunca el del operador", () => {
    expect(isCustomerMcpResource("https://app.ejemplo.test/api/v1/mcp")).toBe(true);
    expect(isCustomerMcpResource("https://app.ejemplo.test/api/v1/mcp/")).toBe(true);
    expect(isCustomerMcpResource(null)).toBe(true);
    expect(isCustomerMcpResource("https://app.ejemplo.test/api/mcp")).toBe(false);
    expect(isCustomerMcpResource("https://otro.test/api/v1/mcp")).toBe(false);
  });

  it("reconoce sus access tokens", () => {
    expect(isMcpAccessToken("mco_abc")).toBe(true);
    expect(isMcpAccessToken("poa_abc")).toBe(false);
    expect(isMcpAccessToken("sk_live_abc")).toBe(false);
  });
});

describe("redirect URIs de clientes públicos", () => {
  it("https, loopback y esquemas de app", () => {
    expect(isValidPublicClientRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isValidPublicClientRedirectUri("http://127.0.0.1:33418/callback")).toBe(true);
    expect(isValidPublicClientRedirectUri("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe(true);
    expect(isValidPublicClientRedirectUri("vscode://vscode.mcp/callback")).toBe(true);
  });

  it("nada que ejecute código, http remoto ni fragmentos", () => {
    for (const uri of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "http://evil.test/cb", "https://ok.test/cb#x", "vbscript:x", "no es url"]) {
      expect(isValidPublicClientRedirectUri(uri), uri).toBe(false);
    }
  });

  it("code_challenge S256 bien formado", () => {
    expect(isValidCodeChallenge("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
    expect(isValidCodeChallenge("corto")).toBe(false);
    expect(isValidCodeChallenge("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw+cM")).toBe(false);
    expect(isValidCodeChallenge(null)).toBe(false);
  });
});

describe("redirectableError", () => {
  it("solo vuelve al cliente si la redirect_uri ya se validó", () => {
    const plain = new OAuthError(400, "invalid_client", "x");
    expect(redirectableError(plain)).toBeNull();
    const withUri = Object.assign(new OAuthError(400, "invalid_request", "PKCE"), { redirectUri: "https://c.test/cb", state: "s1" });
    expect(redirectableError(withUri)).toEqual({ redirectUri: "https://c.test/cb", state: "s1", code: "invalid_request", message: "PKCE" });
  });
});
