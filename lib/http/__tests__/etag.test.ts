import { describe, expect, it } from "vitest";
import { jsonWithEtag, weakEtag } from "../etag";

describe("jsonWithEtag", () => {
  const data = { chats: [{ id: "a" }], total: 1 };

  it("responde 200 con ETag y revalidación obligatoria", async () => {
    const res = jsonWithEtag(new Request("http://x/api"), data);
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBe(weakEtag(JSON.stringify(data)));
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(await res.json()).toEqual(data);
  });

  it("responde 304 sin cuerpo cuando el cliente ya tiene la misma versión", async () => {
    const etag = weakEtag(JSON.stringify(data));
    const res = jsonWithEtag(new Request("http://x/api", { headers: { "If-None-Match": `W/"otro", ${etag}` } }), data);
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("responde 200 cuando el contenido cambió", () => {
    const etag = weakEtag(JSON.stringify(data));
    const res = jsonWithEtag(new Request("http://x/api", { headers: { "If-None-Match": etag } }), { ...data, total: 2 });
    expect(res.status).toBe(200);
  });
});
