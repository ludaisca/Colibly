import { describe, expect, it, vi } from "vitest";

// dispatch.ts importa los handlers de /api/v1 (Prisma, Redis…): aquí solo se
// prueban sus funciones puras, así que esos módulos se reemplazan por handlers
// de mentira. Como las rutas reales, cada módulo exporta los 5 métodos.
const allMethods = () => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() });
vi.mock("@/app/api/v1/me/route", () => allMethods());
vi.mock("@/app/api/v1/accounts/route", () => allMethods());
vi.mock("@/app/api/v1/contacts/route", () => allMethods());
vi.mock("@/app/api/v1/contacts/[id]/route", () => allMethods());
vi.mock("@/app/api/v1/contacts/[id]/tags/route", () => allMethods());
vi.mock("@/app/api/v1/conversations/route", () => allMethods());
vi.mock("@/app/api/v1/conversations/[id]/route", () => allMethods());
vi.mock("@/app/api/v1/conversations/[id]/messages/route", () => allMethods());
vi.mock("@/app/api/v1/messages/route", () => allMethods());
vi.mock("@/app/api/v1/templates/route", () => allMethods());
vi.mock("@/app/api/v1/tags/route", () => allMethods());
vi.mock("@/app/api/v1/teams/route", () => allMethods());
vi.mock("@/app/api/v1/users/route", () => allMethods());
vi.mock("@/app/api/v1/automations/route", () => allMethods());
vi.mock("@/app/api/v1/automations/[id]/runs/route", () => allMethods());

const { matchRoute, mcpIdempotencyKey, apiCallerFor } = await import("../dispatch");
const { toToolResult, toolsForScopes, CUSTOMER_TOOLS, UNTRUSTED_NOTICE } = await import("../tools");

describe("matchRoute", () => {
  it("encuentra la ruta y el id", () => {
    expect(matchRoute("GET", "/contacts")).not.toBeNull();
    expect(matchRoute("GET", "/contacts/cmcon_01")?.params).toEqual({ id: "cmcon_01" });
    expect(matchRoute("POST", "/automations/cmaut_1/runs")?.params).toEqual({ id: "cmaut_1" });
  });

  it("solo las rutas y métodos que usa el MCP", () => {
    expect(matchRoute("DELETE", "/contacts/cmcon_01")).toBeNull(); // el módulo lo exporta (405), pero el MCP no lo usa
    expect(matchRoute("POST", "/me")).toBeNull();
    expect(matchRoute("GET", "/webhooks")).toBeNull(); // fuera de la lista
    expect(matchRoute("GET", "/contacts/a/b/c")).toBeNull();
  });

  it("rechaza ids que no son ids", () => {
    expect(matchRoute("GET", "/contacts/..")).toBeNull();
    expect(matchRoute("GET", "/contacts/a%2Fb")).toBeNull();
    expect(matchRoute("GET", `/contacts/${"x".repeat(65)}`)).toBeNull();
  });
});

describe("mcpIdempotencyKey", () => {
  const t = Date.UTC(2026, 10, 18, 12, 1);
  it("mismo envío en la misma ventana = misma clave", () => {
    const a = mcpIdempotencyKey("k1", "POST", "/messages", { text: "hola" }, t);
    expect(mcpIdempotencyKey("k1", "POST", "/messages", { text: "hola" }, t + 60_000)).toBe(a);
    expect(a).toMatch(/^mcp-[0-9a-f]{48}$/);
  });
  it("cambia con el texto, la key o la ventana", () => {
    const a = mcpIdempotencyKey("k1", "POST", "/messages", { text: "hola" }, t);
    expect(mcpIdempotencyKey("k1", "POST", "/messages", { text: "adiós" }, t)).not.toBe(a);
    expect(mcpIdempotencyKey("k2", "POST", "/messages", { text: "hola" }, t)).not.toBe(a);
    expect(mcpIdempotencyKey("k1", "POST", "/messages", { text: "hola" }, t + 11 * 60_000)).not.toBe(a);
  });
});

describe("apiCallerFor", () => {
  it("reenvía la key, la IP y el cuerpo al handler, con Idempotency-Key si se pide", async () => {
    const { POST } = await import("@/app/api/v1/messages/route");
    const handler = vi.mocked(POST as unknown as (req: Request, ctx: unknown) => Promise<Response>);
    handler.mockResolvedValueOnce(new Response(JSON.stringify({ id: "m1" }), { status: 201 }));
    const mcpReq = new Request("http://x/api/v1/mcp", { method: "POST", headers: { authorization: "Bearer sk_test_abc", "x-real-ip": "1.2.3.4", cookie: "secreto" } });
    const api = apiCallerFor(mcpReq, "http://x");
    const res = await api("POST", "/messages", { body: { type: "text", text: "hola" }, idempotent: true });
    expect(res).toEqual({ status: 201, body: { id: "m1" } });
    const sent = handler.mock.calls[0][0] as Request;
    expect(sent.url).toBe("http://x/api/v1/messages");
    expect(sent.headers.get("authorization")).toBe("Bearer sk_test_abc");
    expect(sent.headers.get("x-real-ip")).toBe("1.2.3.4");
    expect(sent.headers.get("cookie")).toBeNull();
    expect(sent.headers.get("idempotency-key")).toMatch(/^mcp-/);
    expect(await sent.json()).toEqual({ type: "text", text: "hola" });
  });

  it("con una conexión OAuth ata la key al Request y no reenvía el token", async () => {
    const { GET } = await import("@/app/api/v1/me/route");
    const { boundApiKeyHash } = await import("@/lib/api/bound-key");
    const handler = vi.mocked(GET as unknown as (req: Request, ctx: unknown) => Promise<Response>);
    handler.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const mcpReq = new Request("http://x/api/v1/mcp", { method: "POST", headers: { authorization: "Bearer mco_token" } });
    await apiCallerFor(mcpReq, "http://x", { keyHash: "hash-de-la-key" })("GET", "/me");
    const sent = handler.mock.calls[0][0] as Request;
    expect(sent.headers.get("authorization")).toBeNull();
    expect(boundApiKeyHash(sent)).toBe("hash-de-la-key");
    expect(boundApiKeyHash(new Request("http://x/api/v1/me", { headers: { authorization: "Bearer mco_token" } }))).toBeUndefined();
  });

  it("no llama a nada fuera de la lista", async () => {
    const api = apiCallerFor(new Request("http://x/api/v1/mcp"), "http://x");
    expect((await api("DELETE", "/contacts/c1")).status).toBe(404);
  });
});

describe("toToolResult", () => {
  it("éxito en JSON; con aviso si trae textos de terceros", () => {
    expect(toToolResult({ status: 200, body: { a: 1 } })).toEqual({ content: [{ type: "text", text: '{"a":1}' }] });
    expect(toToolResult({ status: 200, body: [] }, { untrusted: true }).content[0].text.startsWith(UNTRUSTED_NOTICE)).toBe(true);
  });
  it("error con código, mensaje y detalle", () => {
    const r = toToolResult({ status: 400, body: { error: { code: "invalid_request", message: "Datos inválidos", details: [{ path: "text", message: "requerido" }] } } });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe("Error 400 (invalid_request): Datos inválidos — text: requerido");
    expect(toToolResult({ status: 402, body: { error: { code: "read_only", message: "Solo lectura" } } }).content[0].text).toContain("read_only");
  });
});

describe("toolsForScopes", () => {
  it("solo las herramientas que permite la key", () => {
    expect(toolsForScopes([]).map((t) => t.name)).toEqual(["get_workspace"]);
    const read = toolsForScopes(["contacts:read", "conversations:read"]).map((t) => t.name);
    expect(read).toContain("list_conversations");
    expect(read).not.toContain("send_message");
    expect(read).not.toContain("update_contact");
  });
  it("todo lo que envía mensajes es irreversible y pide messages:send o automations:run", () => {
    const senders = CUSTOMER_TOOLS.filter((t) => t.irreversible).map((t) => [t.name, t.scope]);
    expect(senders).toEqual([
      ["send_message", "messages:send"],
      ["send_template", "messages:send"],
      ["run_automation", "automations:run"],
    ]);
  });
  it("cada herramienta pide un permiso que existe", async () => {
    const { API_SCOPES } = await import("@/lib/api/scopes");
    for (const t of CUSTOMER_TOOLS) if (t.scope) expect(Object.keys(API_SCOPES)).toContain(t.scope);
  });
});
