import { beforeEach, describe, expect, it, vi } from "vitest";

// DELETE /api/whatsapp/appointments/[id] (QA-018): solo citas canceladas.
const db = vi.hoisted(() => ({
  found: { id: "a1", status: "CANCELLED", assignedToId: "u1", contactId: "c1" } as Record<string, unknown> | null,
  deleted: [] as string[],
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: "admin" } })) }));
vi.mock("@/lib/contacts/scope", () => ({ contactScopeWhere: vi.fn(async () => ({ organizationId: "org1" })) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    wAAppointment: {
      findFirst: vi.fn(async () => db.found),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => { db.deleted.push(where.id); return { id: where.id }; }),
    },
  },
}));
vi.mock("@/lib/appointments", () => ({ canAssignToContact: vi.fn() }));
vi.mock("@/lib/sequences", () => ({ enrollContactInTrigger: vi.fn() }));
vi.mock("@/lib/api-errors", () => ({ publicErrorMessage: (_e: unknown, f: string) => f }));
vi.mock("@/lib/events/emit", () => ({ emitDomainEvent: vi.fn() }));
vi.mock("@/lib/events/refs", () => ({ eventRefsForContact: vi.fn() }));

import { DELETE } from "@/app/api/whatsapp/appointments/[id]/route";

const del = (id = "a1") => DELETE(new Request("https://app.test/x", { method: "DELETE" }), { params: Promise.resolve({ id }) });

describe("DELETE /api/whatsapp/appointments/[id]", () => {
  beforeEach(() => {
    db.found = { id: "a1", status: "CANCELLED", assignedToId: "u1", contactId: "c1" };
    db.deleted = [];
  });

  it("elimina una cita cancelada", async () => {
    expect((await del()).status).toBe(200);
    expect(db.deleted).toEqual(["a1"]);
  });

  it.each(["SCHEDULED", "COMPLETED", "NO_SHOW"])("una cita %s no se elimina (409)", async (status) => {
    db.found = { ...db.found!, status };
    expect((await del()).status).toBe(409);
    expect(db.deleted).toEqual([]);
  });

  it("una cita fuera del alcance responde 404", async () => {
    db.found = null;
    expect((await del("otra")).status).toBe(404);
  });
});
