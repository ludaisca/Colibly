import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, apiError, methodNotAllowed, readJsonBody, withApiErrors } from "../respond";
import { apiConversationUpdateSchema, apiSendMessageSchema } from "../schemas";

// Errores pensados para quien integra: JSON mal formado con su propio
// mensaje, validación en español con la ruta del campo, id de solicitud.
const post = (body: string | null) => new Request("https://x.test/api/v1/messages", { method: "POST", body, headers: { "Content-Type": "application/json" } });

async function failure(req: Request, schema: z.ZodType): Promise<ApiError> {
  try {
    await readJsonBody(req, schema);
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error("se esperaba un ApiError");
}

describe("readJsonBody", () => {
  it("cuerpo vacío: lo dice, no 'se esperaba objeto'", async () => {
    const e = await failure(post(null), apiSendMessageSchema);
    expect(e.status).toBe(400);
    expect(e.message).toMatch(/cuerpo está vacío/);
  });

  it("JSON mal formado: lo dice con la posición", async () => {
    const e = await failure(post("{bad json"), apiSendMessageSchema);
    expect(e.message).toMatch(/no es JSON válido/);
    expect(e.message).toMatch(/posición 1/);
  });

  it("validación en español, con la ruta del campo y todos los detalles", async () => {
    const e = await failure(post(JSON.stringify({ conversationId: "c1", type: "sticker", template: {} })), apiSendMessageSchema);
    expect(e.code).toBe("invalid_request");
    expect(e.details?.map((d) => d.path)).toEqual(expect.arrayContaining(["type", "template.id"]));
    expect(e.message).toMatch(/^type: Opción inválida/);
    expect(e.message).toMatch(/más en details/);
    expect(e.details?.every((d) => !/expected|received/i.test(d.message))).toBe(true);
  });

  it("los mensajes propios del esquema ganan al locale", async () => {
    const e = await failure(post(JSON.stringify({ type: "text", text: "hola" })), apiSendMessageSchema);
    expect(e.message).toBe("Envía conversationId o contactId (uno de los dos)");
  });

  it("devuelve el cuerpo validado", async () => {
    await expect(readJsonBody(post(JSON.stringify({ status: "RESOLVED" })), apiConversationUpdateSchema)).resolves.toEqual({ status: "RESOLVED" });
  });

  it("PATCH de conversación: campos desconocidos y cuerpo sin cambios fallan", async () => {
    expect((await failure(post(JSON.stringify({ estado: "RESOLVED" })), apiConversationUpdateSchema)).details?.[0].message).toMatch(/desconocida/);
    expect((await failure(post("{}"), apiConversationUpdateSchema)).message).toMatch(/status, assignedToId/);
  });
});

describe("id de solicitud", () => {
  it("withApiErrors pone X-Request-Id y error.requestId iguales", async () => {
    const handler = withApiErrors(async () => {
      throw new ApiError(400, "invalid_request", "mal", undefined, [{ path: "a", message: "mal" }]);
    });
    const res = await handler(new Request("https://x.test/api/v1/me"));
    const id = res.headers.get("X-Request-Id");
    expect(id).toMatch(/^req_[\w-]{16}$/);
    const body = await res.json();
    expect(body.error).toEqual({ code: "invalid_request", message: "mal", details: [{ path: "a", message: "mal" }], requestId: id });
  });

  it("cada solicitud tiene su propio id", async () => {
    const handler = withApiErrors(async () => apiError(404, "not_found", "no"));
    const [a, b] = await Promise.all([handler(new Request("https://x.test/a")), handler(new Request("https://x.test/b"))]);
    expect(a.headers.get("X-Request-Id")).not.toBe(b.headers.get("X-Request-Id"));
    expect((await a.json()).error.requestId).toBe(a.headers.get("X-Request-Id"));
  });

  it("fuera de una solicitud no inventa id", async () => {
    expect((await apiError(400, "invalid_request", "x").json()).error).toEqual({ code: "invalid_request", message: "x" });
  });
});

describe("methodNotAllowed", () => {
  it("405 en JSON con Allow", async () => {
    const res = await methodNotAllowed("GET", "PATCH")(new Request("https://x.test/api/v1/conversations/c1", { method: "DELETE" }));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, PATCH");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    const body = await res.json();
    expect(body.error.code).toBe("method_not_allowed");
    expect(body.error.message).toMatch(/DELETE no está permitido/);
  });
});

describe("envío de archivos (esquema)", () => {
  const base = { conversationId: "c1" };
  it("un archivo pide media.url https", async () => {
    expect((await failure(post(JSON.stringify({ ...base, type: "document" })), apiSendMessageSchema)).details?.[0].path).toBe("media");
    expect((await failure(post(JSON.stringify({ ...base, type: "image", media: { url: "http://x.mx/a.png" } })), apiSendMessageSchema)).message).toMatch(/https/);
  });
  it("caption solo con archivo y nunca en audio", async () => {
    expect((await failure(post(JSON.stringify({ ...base, type: "text", text: "hola", caption: "x" })), apiSendMessageSchema)).details?.[0].path).toBe("caption");
    expect((await failure(post(JSON.stringify({ ...base, type: "audio", media: { url: "https://x.mx/a.mp3" }, caption: "x" })), apiSendMessageSchema)).message).toMatch(/audio no lleva caption/);
  });
  it("acepta un documento con nombre y leyenda", async () => {
    const ok = { ...base, type: "document", media: { url: "https://x.mx/f.pdf", filename: "Factura.pdf" }, caption: "Tu factura" };
    await expect(readJsonBody(post(JSON.stringify(ok)), apiSendMessageSchema)).resolves.toMatchObject(ok);
  });
});
