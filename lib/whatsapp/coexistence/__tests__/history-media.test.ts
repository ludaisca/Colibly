import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rows: [] as { id: string; wamid: string; messageType: string }[],
  update: vi.fn(async (_a: unknown) => ({})),
  enqueue: vi.fn(async (..._a: unknown[]) => ({})),
  updated: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { wAMessage: { findMany: vi.fn(async () => db.rows), update: (a: unknown) => db.update(a) } },
}));
vi.mock("@/lib/queue", () => ({ mediaDownloadQueue: { add: (...a: unknown[]) => db.enqueue(...a) } }));
vi.mock("@/lib/events/message-sent", () => ({ emitMessageSent: vi.fn(), emitMessageUpdated: (...a: unknown[]) => db.updated(...a) }));
vi.mock("@/lib/events/emit", () => ({ BACKGROUND_EVENT_PRIORITY: 10, emitDomainEvent: vi.fn() }));
vi.mock("@/lib/billing/contact-limits", () => ({ afterContactCreated: vi.fn() }));
vi.mock("@/lib/billing/contact-budget", () => ({ contactsRemaining: vi.fn(), notifyContactLimitOnce: vi.fn() }));
vi.mock("@/lib/whatsapp/address-book", () => ({ addressBookNameFor: vi.fn(), forgetAddressBookEntry: vi.fn(), shouldApplyAddressBookName: vi.fn() }));
vi.mock("@/lib/automations/dispatch", () => ({ pauseConversationalRuns: vi.fn() }));

import { applyHistoryMedia } from "../ingest";

const item = (wamid: string) => ({ wamid, type: "image", body: "[image]", mediaId: `M_${wamid}`, mimeType: "image/jpeg", filename: null, caption: null });

describe("applyHistoryMedia", () => {
  beforeEach(() => {
    db.rows = [];
    db.update.mockClear();
    db.enqueue.mockClear();
    db.updated.mockClear();
  });

  it("completa el placeholder: tipo real, descarga y message.updated", async () => {
    db.rows = [{ id: "m1", wamid: "w1", messageType: "media_placeholder" }];
    const res = await applyHistoryMedia("acc", [item("w1")]);
    expect(res).toEqual({ updated: 1, alreadyDone: 0, missing: [] });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m1" }, data: expect.objectContaining({ messageType: "image", mediaId: "M_w1" }) }));
    expect(db.enqueue).toHaveBeenCalledWith("download-media", { messageId: "m1", accountId: "acc", mediaId: "M_w1" });
    expect(db.updated).toHaveBeenCalledWith("whatsapp", "m1", "history_media");
  });

  it("es idempotente y reporta lo que aún no existe", async () => {
    db.rows = [{ id: "m1", wamid: "w1", messageType: "image" }];
    const res = await applyHistoryMedia("acc", [item("w1"), item("w2")]);
    expect(res).toEqual({ updated: 0, alreadyDone: 1, missing: ["w2"] });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.enqueue).not.toHaveBeenCalled();
  });
});
