import type { OpenApiSpec } from "@/lib/api/openapi";

// Convierte los paths del OpenAPI en bloques para la referencia pública y
// arma un curl de ejemplo con los mismos datos de ejemplo de la especificación.

export interface EndpointDoc {
  method: string;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  params: { name: string; in: string; required: boolean; type: string; description?: string }[];
  bodyFields: { name: string; type: string; required: boolean; description?: string }[];
  requestExample?: unknown;
  exampleQuery?: string;
  idempotent: boolean;
  successStatus: string;
  responseExample?: unknown;
}

type Json = Record<string, unknown>;
const SAMPLE_IDS: Record<string, string> = {
  "/contacts/{id}": "cmcon_01",
  "/contacts/{id}/tags": "cmcon_01",
  "/conversations/{id}": "cmchat_01",
  "/conversations/{id}/messages": "cmchat_01",
  "/automations/{id}/runs": "cmaut_01",
  "/webhooks/{id}": "cmwh_01",
};

function resolve(spec: OpenApiSpec, node: unknown): Json {
  let n = node as Json;
  for (let i = 0; i < 5 && n && typeof n.$ref === "string"; i++) {
    const [, , section, name] = (n.$ref as string).split("/");
    n = ((spec.components as unknown as Record<string, Record<string, Json>>)[section] ?? {})[name];
  }
  return n ?? {};
}

function typeLabel(spec: OpenApiSpec, schema: unknown): string {
  const s = resolve(spec, schema);
  if (Array.isArray(s.enum)) return (s.enum as string[]).join(" | ");
  const t = Array.isArray(s.type) ? (s.type as string[]).join(" | ") : (s.type as string) ?? "";
  if (t === "array") return `${typeLabel(spec, s.items)}[]`;
  return t || "objeto";
}

export function endpointList(spec: OpenApiSpec): EndpointDoc[] {
  const out: EndpointDoc[] = [];
  for (const [path, item] of Object.entries(spec.paths as unknown as Record<string, Record<string, Json>>)) {
    for (const [method, op] of Object.entries(item)) {
      const params = ((op.parameters as unknown[]) ?? []).map((p) => resolve(spec, p));
      const body = op.requestBody ? ((op.requestBody as Json).content as Json)["application/json"] as Json : undefined;
      const bodySchema = body ? resolve(spec, body.schema) : undefined;
      const required = new Set((bodySchema?.required as string[]) ?? []);
      const responses = op.responses as Record<string, Json>;
      const successStatus = Object.keys(responses).find((s) => s.startsWith("2")) ?? "200";
      const success = resolve(spec, responses[successStatus]);
      const successContent = success.content as Json | undefined;
      out.push({
        method: method.toUpperCase(),
        path,
        tag: ((op.tags as string[]) ?? ["Otros"])[0],
        summary: op.summary as string,
        description: op.description as string | undefined,
        params: params.map((p) => ({
          name: p.name as string,
          in: p.in as string,
          required: !!p.required,
          type: typeLabel(spec, p.schema),
          description: p.description as string | undefined,
        })),
        bodyFields: bodySchema?.properties
          ? Object.entries(bodySchema.properties as Record<string, Json>).map(([name, f]) => ({
              name,
              type: typeLabel(spec, f),
              required: required.has(name),
              description: resolve(spec, f).description as string | undefined,
            }))
          : [],
        requestExample: body?.example,
        exampleQuery: op["x-example-query"] as string | undefined,
        idempotent: params.some((p) => p.name === "Idempotency-Key"),
        successStatus,
        responseExample: (successContent?.["application/json"] as Json | undefined)?.example,
      });
    }
  }
  return out;
}

export function curlFor(e: EndpointDoc, base: string, opts: { idempotencyKey?: string } = {}): string {
  const path = e.path.replace("{id}", SAMPLE_IDS[e.path] ?? "ID");
  const url = `${base}${path}${e.exampleQuery ? `?${e.exampleQuery}` : ""}`;
  const lines = [e.method === "GET" ? `curl "${url}"` : `curl -X ${e.method} "${url}"`, `-H "Authorization: Bearer $COLIBLY_API_KEY"`];
  if (e.requestExample !== undefined) lines.push(`-H "Content-Type: application/json"`);
  if (e.idempotent) lines.push(`-H "Idempotency-Key: ${opts.idempotencyKey ?? "8f14e45f-ceea-4c3a-9d1b-2f6a0c7e5b11"}"`);
  if (e.requestExample !== undefined) lines.push(`-d '${JSON.stringify(e.requestExample)}'`);
  return lines.join(" \\\n  ");
}
