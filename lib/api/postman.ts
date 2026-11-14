// Colección de Postman (formato v2.1) armada desde la especificación OpenAPI:
// una carpeta por tag, cada endpoint con su método, ruta, parámetros y el
// cuerpo de ejemplo. Auth Bearer con la variable {{apiKey}} y la URL base en
// {{baseUrl}}. Pura: la sirve GET /api/v1/postman.json.

interface OpenApiOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Array<{ name?: string; in?: string; required?: boolean; description?: string; $ref?: string }>;
  requestBody?: { content?: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }> }> };
  "x-example-query"?: string;
}

interface OpenApiSpec {
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
}

const METHODS = ["get", "post", "put", "patch", "delete"];

function exampleBody(op: OpenApiOperation): { mode: "raw"; raw: string; options: { raw: { language: "json" } } } | undefined {
  const content = op.requestBody?.content?.["application/json"];
  if (!content) return undefined;
  const example = content.example ?? Object.values(content.examples ?? {})[0]?.value;
  if (example === undefined) return undefined;
  return { mode: "raw", raw: JSON.stringify(example, null, 2), options: { raw: { language: "json" } } };
}

function request(path: string, method: string, op: OpenApiOperation) {
  const segments = path.replace(/^\//, "").split("/").map((s) => s.replace(/^\{(.+)\}$/, ":$1"));
  const pathVars = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({ key: m[1], value: "", description: op.parameters?.find((p) => p.name === m[1])?.description ?? "" }));
  const query = (op["x-example-query"] ?? "")
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const [key, value = ""] = pair.split("=");
      return { key: decodeURIComponent(key), value: decodeURIComponent(value) };
    });
  const body = exampleBody(op);
  const headers = [
    ...(body ? [{ key: "Content-Type", value: "application/json" }] : []),
    ...(op.parameters?.some((p) => p.$ref?.endsWith("/IdempotencyKey")) ? [{ key: "Idempotency-Key", value: "{{$guid}}" }] : []),
  ];
  const raw = `{{baseUrl}}/${segments.join("/")}${query.length ? `?${query.map((q) => `${q.key}=${q.value}`).join("&")}` : ""}`;
  return {
    name: op.summary ?? `${method.toUpperCase()} ${path}`,
    request: {
      method: method.toUpperCase(),
      header: headers,
      url: { raw, host: ["{{baseUrl}}"], path: segments, ...(query.length ? { query } : {}), ...(pathVars.length ? { variable: pathVars } : {}) },
      ...(body ? { body } : {}),
      description: op.description ?? "",
    },
  };
}

export function buildPostmanCollection(spec: OpenApiSpec) {
  const folders = new Map<string, ReturnType<typeof request>[]>();
  for (const tag of spec.tags ?? []) folders.set(tag.name, []);
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = ops[method];
      if (!op) continue;
      const tag = op.tags?.[0] ?? "Otros";
      if (!folders.has(tag)) folders.set(tag, []);
      folders.get(tag)!.push(request(path, method, op));
    }
  }
  return {
    info: {
      name: spec.info.title,
      description: `Versión ${spec.info.version}. Pon tu API key en la variable apiKey.`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    auth: { type: "bearer", bearer: [{ key: "token", value: "{{apiKey}}", type: "string" }] },
    variable: [
      { key: "baseUrl", value: spec.servers?.[0]?.url ?? "" },
      { key: "apiKey", value: "sk_test_…" },
    ],
    item: [...folders.entries()].filter(([, items]) => items.length > 0).map(([name, items]) => ({ name, item: items })),
  };
}
