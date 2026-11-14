import { describe, it, expect } from "vitest";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { buildPostmanCollection } from "@/lib/api/postman";

describe("colección de Postman", () => {
  const spec = buildOpenApiSpec("https://app.test/api/v1");
  const collection = buildPostmanCollection(spec as unknown as Parameters<typeof buildPostmanCollection>[0]);
  const requests = collection.item.flatMap((f) => f.item);

  it("trae un request por cada operación documentada", () => {
    const ops = Object.values(spec.paths as Record<string, Record<string, unknown>>).reduce((n, p) => n + Object.keys(p).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m)).length, 0);
    expect(requests).toHaveLength(ops);
  });

  it("usa {{baseUrl}}, variables :id, Bearer {{apiKey}} e Idempotency-Key", () => {
    expect(collection.auth.bearer[0].value).toBe("{{apiKey}}");
    expect(collection.variable.find((v) => v.key === "baseUrl")?.value).toBe("https://app.test/api/v1");
    const send = requests.find((r) => r.request.method === "POST" && r.request.url.path.join("/") === "messages")!;
    expect(send.request.header).toContainEqual({ key: "Idempotency-Key", value: "{{$guid}}" });
    expect(JSON.parse(send.request.body!.raw)).toHaveProperty("type");
    const contact = requests.find((r) => r.request.method === "GET" && r.request.url.path.join("/") === "contacts/:id")!;
    expect(contact.request.url.variable?.[0].key).toBe("id");
  });
});
