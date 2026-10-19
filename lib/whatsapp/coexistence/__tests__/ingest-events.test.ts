import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  emit: vi.fn(async (..._a: unknown[]) => {}),
  remaining: 100,
  contacts: new Map<string, string>(),
  seq: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wAChat: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: `chat${++db.seq}`, lastMessageAt: null })),
      update: vi.fn(async () => ({})),
    },
    contact: {
      findUnique: vi.fn(async ({ where }: { where: { accountId_remoteJid: { remoteJid: string } } }) => {
        const id = db.contacts.get(where.accountId_remoteJid.remoteJid);
        return id ? { id } : null;
      }),
      upsert: vi.fn(async ({ create }: { create: { remoteJid: string } }) => {
        const id = `con_${create.remoteJid}`;
        db.contacts.set(create.remoteJid, id);
        return { id };
      }),
    },
    wAMessage: { findMany: vi.fn(async () => []), createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })), create: vi.fn() },
    wAAccount: { update: vi.fn(async () => ({ historySkippedChats: 1 })) },
  },
}));
vi.mock("@/lib/events/emit", () => ({ BACKGROUND_EVENT_PRIORITY: 10, emitDomainEvent: (...a: unknown[]) => db.emit(...a) }));
vi.mock("@/lib/billing/contact-limits", () => ({ afterContactCreated: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/contact-budget", () => ({ contactsRemaining: vi.fn(async () => db.remaining), notifyContactLimitOnce: vi.fn(async () => {}) }));
vi.mock("@/lib/queue", () => ({ mediaDownloadQueue: { add: vi.fn() } }));
vi.mock("@/lib/whatsapp/address-book", () => ({
  addressBookNameFor: vi.fn(async () => null),
  forgetAddressBookEntry: vi.fn(async () => {}),
  shouldApplyAddressBookName: vi.fn(() => false),
}));
vi.mock("@/lib/automations/dispatch", () => ({ pauseConversationalRuns: vi.fn(async () => 0) }));

import { HISTORY_EVENT_SPACING_MS, ingestBusinessAppMessages } from "@/lib/whatsapp/coexistence/ingest";
import type { NormalizedBusinessMessage } from "@/lib/whatsapp/coexistence/normalize";

const msg = (userPhone: string, wamid: string): NormalizedBusinessMessage =>
  ({ userPhone, wamid, direction: "OUTBOUND", type: "text", body: "hola", caption: null, mediaId: null, mimeType: null, filename: null, historyStatus: null, timestamp: new Date("2026-10-01T10:00:00Z") }) as unknown as NormalizedBusinessMessage;

describe("coexistencia: contact.created para webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.contacts.clear();
    db.remaining = 100;
    db.seq = 0;
  });

  it("historial: un evento por contacto nuevo, prioridad baja y espaciados", async () => {
    await ingestBusinessAppMessages("acc1", [msg("5215500000001", "w1"), msg("5215500000001", "w2"), msg("5215500000002", "w3"), msg("5215500000003", "w4")], "HISTORY");
    expect(db.emit).toHaveBeenCalledTimes(3); // 3 contactos, no 4 mensajes
    const [first, second, third] = db.emit.mock.calls as unknown as [{ type: string; contactId: string; data: { source: string } }, Date, { priority: number; delayMs: number }][];
    expect(first[0]).toMatchObject({ type: "contact.created", data: { source: "history" }, account: { kind: "whatsapp", id: "acc1" } });
    expect(first[2]).toEqual({ priority: 10, delayMs: 0 });
    expect(second[2].delayMs).toBe(HISTORY_EVENT_SPACING_MS);
    expect(third[2].delayMs).toBe(2 * HISTORY_EVENT_SPACING_MS);
  });

  it("historial al tope del plan: el chat sin contacto no emite nada", async () => {
    db.remaining = 1;
    await ingestBusinessAppMessages("acc1", [msg("5215500000001", "w1"), msg("5215500000002", "w2")], "HISTORY");
    expect(db.emit).toHaveBeenCalledTimes(1);
  });

  it("eco (el negocio escribió primero desde la app): evento normal con source echo", async () => {
    await ingestBusinessAppMessages("acc1", [msg("5215500000009", "w9")], "BUSINESS_APP_ECHO");
    expect(db.emit).toHaveBeenCalledTimes(1);
    const [input, , opts] = db.emit.mock.calls[0] as unknown as [{ data: { source: string } }, Date, unknown];
    expect(input.data.source).toBe("echo");
    expect(opts).toBeUndefined();
  });

  it("contacto que ya existía: sin evento", async () => {
    db.contacts.set("5215500000001", "con_viejo");
    await ingestBusinessAppMessages("acc1", [msg("5215500000001", "w1")], "BUSINESS_APP_ECHO");
    expect(db.emit).not.toHaveBeenCalled();
  });
});
