import { describe, expect, it, vi } from "vitest";

// data-deletion importa prisma y el disco; la decisión es pura y no los necesita.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/whatsapp/media-store", () => ({ removeAccountMedia: vi.fn() }));
vi.mock("@/lib/whatsapp/coexistence/notify", () => ({ notifyAccountAdmins: vi.fn() }));
import { buildSignedRequest, parseSignedRequest } from "../signed-request";

const SECRET = "app-secret-de-prueba";

describe("parseSignedRequest", () => {
  it("acepta una firma válida y devuelve el payload", () => {
    const sr = buildSignedRequest({ user_id: "1234567890", issued_at: 1738796547 }, SECRET);
    expect(parseSignedRequest(sr, SECRET)).toMatchObject({ user_id: "1234567890", algorithm: "HMAC-SHA256" });
  });
  it("rechaza una firma hecha con otro secreto", () => {
    expect(parseSignedRequest(buildSignedRequest({ user_id: "1" }, "otro"), SECRET)).toBeNull();
  });
  it("rechaza un payload alterado", () => {
    const [sig] = buildSignedRequest({ user_id: "1" }, SECRET).split(".");
    const forged = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" })).toString("base64url");
    expect(parseSignedRequest(`${sig}.${forged}`, SECRET)).toBeNull();
  });
  it("rechaza algoritmos distintos de HMAC-SHA256", () => {
    const sr = buildSignedRequest({ algorithm: "HMAC-SHA1" } as never, SECRET);
    expect(parseSignedRequest(sr, SECRET)).toBeNull();
  });
  it("rechaza entradas mal formadas o sin secreto", () => {
    for (const bad of [null, undefined, "", "sin-punto", "a.b.c", ".", "x."]) expect(parseSignedRequest(bad as never, SECRET)).toBeNull();
    expect(parseSignedRequest(buildSignedRequest({ user_id: "1" }, SECRET), null)).toBeNull();
    expect(parseSignedRequest(buildSignedRequest({ user_id: "1" }, SECRET), "")).toBeNull();
  });
  it("no revienta con base64 inválido", () => {
    expect(parseSignedRequest("%%%.%%%", SECRET)).toBeNull();
  });
});

import { decideDeletion } from "../data-deletion";

describe("decideDeletion (salvaguarda de borrado)", () => {
  it("sin cuentas: nada que borrar", () => expect(decideDeletion([])).toBe("none"));
  it("una o varias cuentas de la misma organización: se borran", () => {
    expect(decideDeletion([{ organizationId: "o1" }])).toBe("delete");
    expect(decideDeletion([{ organizationId: "o1" }, { organizationId: "o1" }])).toBe("delete");
  });
  it("cuentas de varias organizaciones con el mismo user_id: revisión manual, no se borra", () => {
    expect(decideDeletion([{ organizationId: "o1" }, { organizationId: "o2" }])).toBe("manual_review");
  });
});
