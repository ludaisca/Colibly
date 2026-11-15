import { beforeEach, describe, expect, it, vi } from "vitest";

// DELETE /api/whatsapp/contacts/[id] (QA-018): solo admin, 404 fuera del
// alcance y borra chat + conversación + contacto en una transacción.
const db = vi.hoisted(() => ({
  role: "admin",
  found: { id: "c1" } as { id: string } | null,
  calls: [] as string[],
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: db.role } })) }));
vi.mock("@/lib/contacts/scope", () => ({ contactScopeWhere: vi.fn(async () => ({ organizationId: "org1" })) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findFirst: vi.fn(async () => db.found),
      delete: vi.fn(({ where }: { where: { id: string } }) => { db.calls.push(`contact:${where.id}`); return { id: where.id }; }),
    },
    wAChat: { deleteMany: vi.fn(({ where }: { where: { contactId: string } }) => { db.calls.push(`chat:${where.contactId}`); return { count: 1 }; }) },
    conversation: { deleteMany: vi.fn(({ where }: { where: { contactId: string } }) => { db.calls.push(`conversation:${where.contactId}`); return { count: 0 }; }) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));
vi.mock("@/lib/api-errors", () => ({ publicErrorMessage: (_e: unknown, f: string) => f }));
vi.mock("@/lib/contacts/side-effects", () => ({ afterLeadStatusChanged: vi.fn() }));
vi.mock("@/lib/contacts/activity", () => ({ recordContactActivity: vi.fn() }));
vi.mock("@/lib/tenancy", () => ({ requireOrgId: vi.fn(async () => "org1") }));

import { DELETE } from "@/app/api/whatsapp/contacts/[id]/route";

const del = (id = "c1") => DELETE(new Request(`https://app.test/api/whatsapp/contacts/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

describe("DELETE /api/whatsapp/contacts/[id]", () => {
  beforeEach(() => {
    db.role = "admin";
    db.found = { id: "c1" };
    db.calls = [];
  });

  it("borra el chat, la conversación y el contacto", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(db.calls).toEqual(["chat:c1", "conversation:c1", "contact:c1"]);
  });

  it("un contacto fuera del alcance responde 404 y no borra nada", async () => {
    db.found = null;
    expect((await del("otro")).status).toBe(404);
    expect(db.calls).toEqual([]);
  });

  it.each(["user", "ejecutivo"])("el rol %s no puede eliminar (403)", async (role) => {
    db.role = role;
    expect((await del()).status).toBe(403);
    expect(db.calls).toEqual([]);
  });
});
