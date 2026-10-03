import { afterEach, describe, expect, it, vi } from "vitest";

// graph.ts lee el entorno al cargarse: cada caso importa una copia nueva.
async function load(env: Record<string, string>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("../graph");
}

afterEach(() => vi.unstubAllEnvs());

describe("graphUrl", () => {
  it("usa la versión central y quita barras iniciales", async () => {
    const { graphUrl, GRAPH_API_VERSION } = await load({ NODE_ENV: "development", META_GRAPH_ORIGIN: "" });
    expect(graphUrl("/1234/subscribed_apps")).toBe(`https://graph.facebook.com/${GRAPH_API_VERSION}/1234/subscribed_apps`);
  });
  it("agrega parámetros y omite los indefinidos", async () => {
    const { graphUrl } = await load({ NODE_ENV: "development", META_GRAPH_ORIGIN: "" });
    const url = new URL(graphUrl("oauth/access_token", { client_id: "1", code: "abc", redirect_uri: undefined }));
    expect(url.searchParams.get("client_id")).toBe("1");
    expect(url.searchParams.get("code")).toBe("abc");
    expect(url.searchParams.has("redirect_uri")).toBe(false);
  });
});

describe("desvío de desarrollo (META_GRAPH_ORIGIN)", () => {
  it("en desarrollo apunta al Meta simulado", async () => {
    const { graphUrl, GRAPH_API_ORIGIN } = await load({ NODE_ENV: "development", META_GRAPH_ORIGIN: "http://127.0.0.1:9999/" });
    expect(GRAPH_API_ORIGIN).toBe("http://127.0.0.1:9999");
    expect(graphUrl("x")).toMatch(/^http:\/\/127\.0\.0\.1:9999\/v\d+\.\d+\/x$/);
  });
  it("en producción SIEMPRE se ignora", async () => {
    const { GRAPH_API_ORIGIN } = await load({ NODE_ENV: "production", META_GRAPH_ORIGIN: "http://127.0.0.1:9999" });
    expect(GRAPH_API_ORIGIN).toBe("https://graph.facebook.com");
  });
});
