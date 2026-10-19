import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { DOMAIN_EVENT_TYPES } from "@/lib/events/types";

// La página pública /docs/api se arma desde esta especificación: si una ruta
// de app/api/v1 no está aquí, no existe para quien integra.
const V1 = path.resolve(__dirname, "../../../app/api/v1");

function routes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routes(full, `${prefix}/${name.replace(/^\[(.+)\]$/, "{$1}")}`));
    else if (name === "route.ts") out.push(prefix);
  }
  return out;
}

describe("OpenAPI", () => {
  const spec = buildOpenApiSpec("https://app.test/api/v1");

  it("documenta todas las rutas de app/api/v1", () => {
    const documented = Object.keys(spec.paths);
    for (const r of routes(V1).filter((r) => r !== "/openapi.json")) expect(documented).toContain(r);
  });

  it("todo endpoint tiene respuesta de éxito con ejemplo y headers de límite", () => {
    for (const [p, item] of Object.entries(spec.paths as Record<string, Record<string, { responses: Record<string, { headers?: object; content?: Record<string, { example?: unknown }> }> }>>)) {
      for (const [m, op] of Object.entries(item)) {
        const ok = Object.entries(op.responses).find(([s]) => s.startsWith("2"));
        expect(ok, `${m} ${p}`).toBeTruthy();
        expect(ok![1].content?.["application/json"]?.example, `${m} ${p}`).toBeDefined();
        expect(ok![1].headers, `${m} ${p}`).toHaveProperty("X-RateLimit-Remaining");
      }
    }
  });

  it("los POST de creación aceptan Idempotency-Key", () => {
    const paths = spec.paths as unknown as Record<string, Record<string, { parameters?: { $ref?: string }[] }>>;
    for (const p of ["/messages", "/contacts", "/contacts/{id}/tags", "/automations/{id}/runs"]) {
      expect(paths[p].post.parameters?.some((x) => x.$ref === "#/components/parameters/IdempotencyKey"), p).toBe(true);
    }
  });

  it("el catálogo de eventos cubre todos los eventos de dominio más webhook.test", () => {
    const types = spec["x-colibly-events"].map((e) => e.type);
    expect(types).toEqual([...DOMAIN_EVENT_TYPES, "webhook.test"]);
  });
});
