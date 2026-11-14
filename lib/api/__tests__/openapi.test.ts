import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { DOMAIN_EVENT_TYPES } from "@/lib/events/types";
import { serializeMessage } from "@/lib/messages/serialize";

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
    // /{...path} es el 404 en JSON para rutas inexistentes, no un endpoint.
    for (const r of routes(V1).filter((r) => r !== "/openapi.json" && r !== "/postman.json" && r !== "/{...path}")) expect(documented).toContain(r);
  });

  // Cada ruta atiende exactamente los métodos que documenta, y responde 405 en
  // JSON a los demás (Next respondería un 405 vacío si no se exportan).
  it("cada ruta exporta los 5 métodos y atiende solo los documentados", () => {
    const paths = spec.paths as unknown as Record<string, Record<string, unknown>>;
    for (const r of routes(V1).filter((r) => r !== "/{...path}")) {
      const file = path.join(V1, r.replace(/\{([^}]+)\}/g, "[$1]"), "route.ts");
      const src = readFileSync(file, "utf8");
      const served: string[] = [];
      for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const decl = new RegExp(`^export (?:const|async function|function) ${m}\\b(.*)$`, "m").exec(src);
        expect(decl, `${r}: falta exportar ${m}`).toBeTruthy();
        const isGuard = /=\s*(?:methodNotAllowed\(|(?:GET|POST|PUT|PATCH|DELETE);)/.test(decl![1]);
        if (!isGuard) served.push(m.toLowerCase());
      }
      if (r === "/openapi.json" || r === "/postman.json") continue;
      expect(served.sort(), r).toEqual(Object.keys(paths[r]).sort());
    }
  });

  it("todo endpoint tiene respuesta de éxito con ejemplo y headers de límite", () => {
    for (const [p, item] of Object.entries(spec.paths as Record<string, Record<string, { responses: Record<string, { headers?: object; content?: Record<string, { example?: unknown }> }> }>>)) {
      for (const [m, op] of Object.entries(item)) {
        const ok = Object.entries(op.responses).find(([s]) => s.startsWith("2"));
        expect(ok, `${m} ${p}`).toBeTruthy();
        // Las respuestas JSON llevan ejemplo; una descarga binaria (medios) no.
        const content = ok![1].content ?? {};
        if (content["application/json"]) expect(content["application/json"].example, `${m} ${p}`).toBeDefined();
        else expect(Object.keys(content).length, `${m} ${p}`).toBeGreaterThan(0);
        expect(ok![1].headers, `${m} ${p}`).toHaveProperty("X-RateLimit-Remaining");
        expect(ok![1].headers, `${m} ${p}`).toHaveProperty("X-Request-Id");
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

  // Contrato: lo que entrega el código y lo que dice el OpenAPI no se desfasan.
  const schemas = spec.components.schemas as unknown as Record<string, { properties: Record<string, unknown> }>;

  it("Message documenta exactamente los campos de serializeMessage", () => {
    const out = serializeMessage(
      { id: "m", direction: "OUTBOUND", messageType: "text", body: "x", caption: null, mimeType: null, filename: null, status: "sent", senderId: null, timestamp: new Date() },
      "c"
    );
    expect(Object.keys(schemas.Message.properties).sort()).toEqual(Object.keys(out).sort());
  });

  it("el ejemplo de mensaje tiene todos los campos del serializador", () => {
    const event = spec["x-colibly-events"].find((e) => e.type === "message.received")!;
    const example = (event.example as { message: Record<string, unknown> }).message;
    expect(Object.keys(example).sort()).toEqual(Object.keys(schemas.Message.properties).sort());
  });

  it("el data de cada evento documenta los campos de su ejemplo", () => {
    for (const e of spec["x-colibly-events"]) {
      const props = Object.keys((e.data as { properties?: Record<string, unknown> }).properties ?? {});
      const example = Object.keys((e.example as { data: Record<string, unknown> }).data);
      expect(example.sort(), e.type).toEqual(props.sort());
    }
  });

  it("el sobre del evento documenta account y contact completos", () => {
    const event = schemas.Event.properties as Record<string, { properties?: Record<string, unknown> }>;
    const example = spec["x-colibly-events"].find((e) => e.type === "message.sent")!.example as unknown as Record<string, Record<string, unknown>>;
    expect(Object.keys(event.account.properties!).sort()).toEqual(Object.keys(example.account).sort());
    expect(Object.keys(event.contact.properties!).sort()).toEqual(Object.keys(example.contact).sort());
  });

  it("publica el changelog con la versión vigente primero", () => {
    expect(spec.info.version).toBe(spec["x-colibly-changelog"][0].version);
  });
});
