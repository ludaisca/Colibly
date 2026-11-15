import { beforeEach, describe, expect, it, vi } from "vitest";

// Administrador de etiquetas (QA-018): PATCH / DELETE /api/whatsapp/tags/[id].
const db = vi.hoisted(() => ({
  role: "admin",
  found: { id: "t1" } as { id: string } | null,
  where: null as unknown,
  updated: null as unknown,
  deleted: [] as string[],
  conflict: false,
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: db.role } })) }));
vi.mock("@/lib/shared-accounts", () => ({
  getUserAccountIds: vi.fn(async () => ["wa1"]),
  getUserChannelAccountIds: vi.fn(async () => ["ch1"]),
}));
vi.mock("@/lib/tenancy", () => ({ requireOrgId: vi.fn(async () => "org1") }));
vi.mock("@/lib/api-errors", () => ({ publicErrorMessage: (_e: unknown, f: string) => f }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tag: {
      findFirst: vi.fn(async (args: { where: unknown }) => { db.where = args.where; return db.found; }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (db.conflict) throw Object.assign(new Error("dup"), { code: "P2002" });
        db.updated = data;
        return { id: "t1", ...data };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => { db.deleted.push(where.id); return { id: where.id }; }),
    },
  },
}));

import { DELETE, PATCH } from "@/app/api/whatsapp/tags/[id]/route";

const ctx = (id = "t1") => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, id = "t1") => PATCH(new Request("https://app.test/x", { method: "PATCH", body: JSON.stringify(body) }), ctx(id));
const del = (id = "t1") => DELETE(new Request("https://app.test/x", { method: "DELETE" }), ctx(id));

describe("PATCH /api/whatsapp/tags/[id]", () => {
  beforeEach(() => {
    Object.assign(db, { role: "admin", found: { id: "t1" }, where: null, updated: null, deleted: [], conflict: false });
  });

  it("renombra y cambia el color", async () => {
    const res = await patch({ name: " VIP ", color: "hue-3" });
    expect(res.status).toBe(200);
    expect(db.updated).toEqual({ name: "VIP", color: "hue-3" });
  });

  it("solo busca etiquetas de las cuentas de la persona o de su organización", async () => {
    await patch({ name: "VIP" });
    expect(JSON.stringify(db.where)).toContain("wa1");
    expect(JSON.stringify(db.where)).toContain("ch1");
    expect(JSON.stringify(db.where)).toContain("org1");
  });

  it("una etiqueta ajena responde 404", async () => {
    db.found = null;
    expect((await patch({ name: "X" }, "ajena")).status).toBe(404);
  });

  it("rechaza un color que no es de la paleta y un nombre vacío", async () => {
    expect((await patch({ color: "#ff0000" })).status).toBe(400);
    expect((await patch({ name: "   " })).status).toBe(400);
  });

  it("un nombre repetido en la cuenta responde 409", async () => {
    db.conflict = true;
    expect((await patch({ name: "VIP" })).status).toBe(409);
  });

  it.each(["user", "ejecutivo"])("el rol %s no puede editar etiquetas", async (role) => {
    db.role = role;
    expect((await patch({ name: "VIP" })).status).toBe(403);
  });
});

describe("DELETE /api/whatsapp/tags/[id]", () => {
  beforeEach(() => {
    Object.assign(db, { role: "admin", found: { id: "t1" }, deleted: [] });
  });

  it("elimina la etiqueta propia", async () => {
    expect((await del()).status).toBe(200);
    expect(db.deleted).toEqual(["t1"]);
  });

  it("404 para una etiqueta ajena y 403 para ejecutivo", async () => {
    db.found = null;
    expect((await del("ajena")).status).toBe(404);
    db.found = { id: "t1" };
    db.role = "ejecutivo";
    expect((await del()).status).toBe(403);
    expect(db.deleted).toEqual([]);
  });
});
