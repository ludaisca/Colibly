import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  contact: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  contactTag: { findMany: vi.fn(), createMany: vi.fn() },
  wANote: { updateMany: vi.fn() },
  wAAppointment: { updateMany: vi.fn() },
  contactTask: { updateMany: vi.fn() },
  contactActivity: { updateMany: vi.fn() },
  leadOutcomeEvent: { updateMany: vi.fn() },
  tag: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
};
const prismaMock = {
  wAAccount: { count: vi.fn() },
  contact: { findMany: vi.fn() },
  tag: { count: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/shared-accounts", () => ({ invalidateAccountScopes: vi.fn() }));

const { linkChannellessContacts } = await import("../link-orphans");

function resetAll() {
  for (const group of [tx, prismaMock] as Record<string, unknown>[]) {
    for (const v of Object.values(group)) {
      if (v && typeof v === "object") Object.values(v).forEach((f) => typeof f === "function" && "mockReset" in f && (f as ReturnType<typeof vi.fn>).mockReset());
    }
  }
  prismaMock.$transaction.mockClear();
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<void>) => fn(tx));
  tx.tag.findMany.mockResolvedValue([]);
  tx.contactTag.findMany.mockResolvedValue([]);
}

beforeEach(resetAll);

const orphan = { id: "o1", remoteJid: "525512345678", leadStatus: "NEW", pipelineStageId: null, dealValueCents: null, expectedCloseAt: null };

describe("linkChannellessContacts", () => {
  it("solo se vincula con el primer WhatsApp de la organización", async () => {
    prismaMock.wAAccount.count.mockResolvedValue(2);
    const r = await linkChannellessContacts("org1", "wa2");
    expect(r).toEqual({ linked: 0, merged: 0, tagsMoved: 0 });
    expect(prismaMock.contact.findMany).not.toHaveBeenCalled();
  });
  it("mueve a la cuenta el contacto sin canal y lo deja de ser de la organización", async () => {
    prismaMock.wAAccount.count.mockResolvedValue(1);
    prismaMock.contact.findMany.mockResolvedValue([orphan]);
    tx.contact.findFirst.mockResolvedValue(null);
    const r = await linkChannellessContacts("org1", "wa1");
    expect(r.linked).toBe(1);
    expect(tx.contact.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { accountId: "wa1", organizationId: null } });
  });
  it("busca el duplicado también con la forma 521 y lo fusiona en lugar de crear otro", async () => {
    prismaMock.wAAccount.count.mockResolvedValue(1);
    prismaMock.contact.findMany.mockResolvedValue([{ ...orphan, leadStatus: "QUALIFIED" }]);
    tx.contact.findFirst.mockResolvedValue({ id: "t1", leadStatus: "NEW", pipelineStageId: null, dealValueCents: null });
    tx.contactTag.findMany.mockResolvedValue([{ tagId: "tag1" }]);
    const r = await linkChannellessContacts("org1", "wa1");
    expect(tx.contact.findFirst.mock.calls[0][0].where.remoteJid.in.sort()).toEqual(["5215512345678", "525512345678"]);
    expect(r).toMatchObject({ linked: 0, merged: 1 });
    expect(tx.contactTag.createMany).toHaveBeenCalledWith({ data: [{ contactId: "t1", tagId: "tag1" }], skipDuplicates: true });
    expect(tx.wAAppointment.updateMany).toHaveBeenCalledWith({ where: { contactId: "o1" }, data: { contactId: "t1" } });
    expect(tx.contact.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { leadStatus: "QUALIFIED", pipelineStageId: null } });
    expect(tx.contact.delete).toHaveBeenCalledWith({ where: { id: "o1" } });
  });
  it("las etiquetas de la organización pasan a la cuenta; si ya existe una igual se reutiliza", async () => {
    prismaMock.wAAccount.count.mockResolvedValue(1);
    prismaMock.contact.findMany.mockResolvedValue([]);
    prismaMock.tag.count.mockResolvedValue(2);
    tx.tag.findMany.mockResolvedValue([{ id: "a", name: "Facial" }, { id: "b", name: "VIP" }]);
    tx.tag.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "same" });
    tx.contactTag.findMany.mockResolvedValue([{ contactId: "c1" }]);
    const r = await linkChannellessContacts("org1", "wa1");
    expect(r.tagsMoved).toBe(2);
    expect(tx.tag.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { waAccountId: "wa1", organizationId: null } });
    expect(tx.contactTag.createMany).toHaveBeenCalledWith({ data: [{ contactId: "c1", tagId: "same" }], skipDuplicates: true });
    expect(tx.tag.delete).toHaveBeenCalledWith({ where: { id: "b" } });
  });
  it("sin nada que vincular no abre transacción (idempotente)", async () => {
    prismaMock.wAAccount.count.mockResolvedValue(1);
    prismaMock.contact.findMany.mockResolvedValue([]);
    prismaMock.tag.count.mockResolvedValue(0);
    await linkChannellessContacts("org1", "wa1");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
