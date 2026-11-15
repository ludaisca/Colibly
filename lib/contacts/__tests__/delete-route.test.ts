import { beforeEach, describe, expect, it, vi } from "vitest";

// DELETE /api/whatsapp/contacts/[id] (QA-018): solo admin, 404 fuera del
// alcance y borra chat + conversación + contacto en una transacción.
type Row = { id: string; accountId: string | null; channelAccountId: string | null; organizationId: string | null };
const db = vi.hoisted(() => ({
  role: "admin",
  found: { id: "c1" } as { id: string } | null,
  calls: [] as string[],
  // Con `rows`, findFirst evalúa de verdad el alcance (buildContactScope) contra estas filas.
  rows: null as Row[] | null,
  lastWhere: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: db.role } })) }));
vi.mock("@/lib/contacts/scope", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/contacts/scope")>();
  // El admin de org1, sin cuentas conectadas: solo ve los contactos sin canal de org1.
  return { ...real, contactScopeWhere: vi.fn(async () => real.buildContactScope({ accountIds: [], channelAccountIds: [], organizationId: "org1", isAdmin: db.role === "admin" })) };
});

// Evaluador mínimo de { id, OR: [...] } con `in` y valores exactos (incluido null).
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Record<string, unknown>[]).some((sub) => matches(row, sub));
    if (cond && typeof cond === "object" && "in" in cond) return (cond as { in: unknown[] }).in.includes(row[key]);
    return row[key] === cond;
  });
}
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        db.lastWhere = where;
        if (!db.rows) return db.found;
        const row = db.rows.find((r) => matches(r, where));
        return row ? { id: row.id } : null;
      }),
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
    db.rows = null;
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

  it("un contacto sin canal de OTRA organización responde 404 y no borra nada", async () => {
    db.rows = [
      { id: "propio", accountId: null, channelAccountId: null, organizationId: "org1" },
      { id: "ajeno", accountId: null, channelAccountId: null, organizationId: "org2" },
    ];
    expect((await del("ajeno")).status).toBe(404);
    expect(db.calls).toEqual([]);
    // Control: el sin canal de su propia organización sí se borra.
    expect((await del("propio")).status).toBe(200);
    expect(db.calls).toEqual(["chat:propio", "conversation:propio", "contact:propio"]);
  });
});
