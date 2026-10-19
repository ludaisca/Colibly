import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  endpoints: [] as { id: string; name: string }[],
  updateMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
  admins: [] as { id: string }[],
  createMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
  existing: null as Record<string, unknown> | null,
  update: vi.fn(async (args: { data: Record<string, unknown> }) => ({ ...db.existing, ...args.data })),
  ownAccounts: ["acc1"],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEndpoint: {
      findMany: vi.fn(async () => db.endpoints),
      updateMany: (a: unknown) => db.updateMany(a),
      findFirst: vi.fn(async () => db.existing),
      update: (a: { data: Record<string, unknown> }) => db.update(a),
    },
    user: { findMany: vi.fn(async () => db.admins) },
    notification: { createMany: (a: unknown) => db.createMany(a) },
  },
}));
vi.mock("@/lib/tenancy", () => ({ orgWhere: vi.fn(async () => ({ organizationId: "org1" })), requireOrgId: vi.fn(async () => "org1") }));
vi.mock("@/lib/shared-accounts", () => ({ getUserAccountIds: vi.fn(async () => db.ownAccounts), getUserChannelAccountIds: vi.fn(async () => []) }));
vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => `enc:${s}` }));
vi.mock("@/lib/api/limits", () => ({ webhookCapExceeded: vi.fn(async () => null) }));

import { pauseWebhooksOfUser } from "@/lib/webhooks/ownership";
import { updateWebhook, WebhookInputError, webhookStatus } from "@/lib/webhooks/crud";

describe("pauseWebhooksOfUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.endpoints = [];
    db.admins = [];
  });

  it("pausa los webhooks activos del usuario y avisa a los DEMÁS admins", async () => {
    db.endpoints = [{ id: "w1", name: "ERP" }, { id: "w2", name: "BI" }];
    db.updateMany.mockResolvedValueOnce({ count: 2 });
    db.admins = [{ id: "a2" }, { id: "a3" }];
    const n = await pauseWebhooksOfUser("u1", "org1", "demoted", "Ana");
    expect(n).toBe(2);
    const upd = db.updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(upd.where).toMatchObject({ organizationId: "org1" });
    expect(upd.data).toMatchObject({ active: false, pausedReason: "Su creador dejó de ser administrador (Ana)" });
    expect(upd.data.pausedAt).toBeInstanceOf(Date);
    const notes = (db.createMany.mock.calls[0][0] as { data: { userId: string; title: string; link: string }[] }).data;
    expect(notes.map((x) => x.userId)).toEqual(["a2", "a3"]);
    expect(notes[0].title).toBe("2 webhooks pausados");
    expect(notes[0].link).toContain("webhooks");
  });

  it("sin webhooks activos no hace nada", async () => {
    expect(await pauseWebhooksOfUser("u1", "org1", "disabled")).toBe(0);
    expect(db.updateMany).not.toHaveBeenCalled();
    expect(db.createMany).not.toHaveBeenCalled();
  });
});

describe("reactivar un webhook pausado", () => {
  const paused = {
    id: "w1",
    userId: "u1",
    organizationId: "org1",
    active: false,
    pausedAt: new Date(),
    pausedReason: "Su creador dejó de ser administrador",
    disabledAt: null,
    accountIds: ["acc1"],
    channelAccountIds: [],
    user: { role: "user", disabledAt: null },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.existing = { ...paused };
    db.ownAccounts = ["acc1"];
  });

  it("sin takeOwnership se rechaza con un mensaje claro", async () => {
    await expect(updateWebhook("admin2", "w1", { active: true })).rejects.toBeInstanceOf(WebhookInputError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("con takeOwnership pasa al admin que lo reactiva y limpia la pausa", async () => {
    await updateWebhook("admin2", "w1", { active: true, takeOwnership: true });
    const data = db.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ active: true, userId: "admin2", pausedAt: null, pausedReason: null, disabledAt: null, consecutiveFailures: 0 });
    expect(data).not.toHaveProperty("takeOwnership");
  });

  it("al tomar la propiedad valida el recorte de cuentas contra el NUEVO dueño", async () => {
    db.ownAccounts = ["otra"];
    await expect(updateWebhook("admin2", "w1", { active: true, takeOwnership: true })).rejects.toThrow(/Cuenta de WhatsApp no válida/);
  });

  it("webhookStatus distingue pausado, desactivado por fallos e inactivo", () => {
    expect(webhookStatus({ active: true, pausedAt: null, disabledAt: null })).toBe("active");
    expect(webhookStatus({ active: false, pausedAt: new Date(), disabledAt: null })).toBe("paused");
    expect(webhookStatus({ active: false, pausedAt: null, disabledAt: new Date() })).toBe("disabled");
    expect(webhookStatus({ active: false, pausedAt: null, disabledAt: null })).toBe("inactive");
  });
});
