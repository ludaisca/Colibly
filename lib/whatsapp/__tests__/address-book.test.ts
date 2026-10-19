import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  wAChat: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  wAAddressBookEntry: { findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(async () => ({ count: 0 })) },
  wAMessage: { findMany: vi.fn(async () => []), createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })), create: vi.fn() },
  wAAccount: { update: vi.fn(async () => ({ historySkippedChats: 1 })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/queue", () => ({ mediaDownloadQueue: { add: vi.fn(async () => {}) } }));
vi.mock("@/lib/automations/dispatch", () => ({ pauseConversationalRuns: vi.fn(async () => {}) }));
const budget = vi.hoisted(() => ({ remaining: 5, notify: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/contact-budget", () => ({
  contactsRemaining: vi.fn(async () => budget.remaining),
  notifyContactLimitOnce: (...a: unknown[]) => budget.notify(...(a as [])),
}));

import { shouldApplyAddressBookName, shouldApplyProfileName } from "@/lib/whatsapp/address-book";
import { applyStateSyncContacts, ingestBusinessAppMessages } from "@/lib/whatsapp/coexistence/ingest";

const c = (o: Partial<{ name: string | null; nameSource: string | null; remoteJid: string }> = {}) => ({ name: "5215511112222", nameSource: null, remoteJid: "5215511112222", ...o });

describe("reglas de nombre", () => {
  it("la libreta pisa número y perfil, nunca lo editado por el usuario", () => {
    expect(shouldApplyAddressBookName("Ana López", c())).toBe(true);
    expect(shouldApplyAddressBookName("Ana López", c({ name: "Anita", nameSource: null }))).toBe(true);
    expect(shouldApplyAddressBookName("Ana López", c({ name: "Ana (cliente VIP)", nameSource: "user" }))).toBe(false);
    expect(shouldApplyAddressBookName("5215511112222", c())).toBe(false);
  });
  it("el perfil de WhatsApp no pisa libreta ni usuario", () => {
    expect(shouldApplyProfileName("Anita", c({ name: "Ana López", nameSource: "address_book" }))).toBe(false);
    expect(shouldApplyProfileName("Anita", c({ name: "Ana", nameSource: "user" }))).toBe(false);
    expect(shouldApplyProfileName("Anita", c())).toBe(true);
    expect(shouldApplyProfileName("Anita", null)).toBe(true);
  });
});

const sync = (phone: string, name: string | null, action: "add" | "remove" = "add") => ({ phone, fullName: name, firstName: null, action, changedAt: new Date() });

describe("applyStateSyncContacts (libreta)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("no crea contactos: guarda el nombre en la libreta", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    const r = await applyStateSyncContacts("acc1", [sync("5215511112222", "Ana López")] as never);
    expect(r).toEqual({ named: 0, cached: 1, removed: 0 });
    expect(db.contact.upsert).not.toHaveBeenCalled();
    expect(db.wAAddressBookEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { accountId: "acc1", phone: "5215511112222", name: "Ana López" } }));
  });
  it("pone el nombre a un contacto existente (52/521) y lo marca de la libreta", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "ct1", ...c({ remoteJid: "525511112222", name: "525511112222" }) });
    const r = await applyStateSyncContacts("acc1", [sync("5215511112222", "Ana López")] as never);
    expect(r.named).toBe(1);
    expect(db.contact.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId: "acc1", remoteJid: { in: ["5215511112222", "525511112222"] } } }));
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "ct1" }, data: { name: "Ana López", nameSource: "address_book" } });
  });
  it("respeta un nombre editado por el usuario", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "ct1", ...c({ name: "Ana VIP", nameSource: "user" }) });
    expect((await applyStateSyncContacts("acc1", [sync("5215511112222", "Ana López")] as never)).named).toBe(0);
    expect(db.contact.update).not.toHaveBeenCalled();
  });
  it("una baja solo borra la entrada de la libreta", async () => {
    db.wAAddressBookEntry.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect((await applyStateSyncContacts("acc1", [sync("5215511112222", null, "remove")] as never)).removed).toBe(1);
    expect(db.contact.update).not.toHaveBeenCalled();
  });
});

const msg = (phone: string, wamid: string) => ({ wamid, userPhone: phone, direction: "INBOUND", type: "text", body: "hola", caption: null, mediaId: null, mimeType: null, filename: null, historyStatus: null, timestamp: new Date("2026-10-10T10:00:00Z") });

describe("historial y tope de contactos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.wAChat.findFirst.mockResolvedValue(null);
    db.contact.findUnique.mockResolvedValue(null);
    db.wAAddressBookEntry.findFirst.mockResolvedValue(null);
    db.contact.upsert.mockImplementation(async ({ create }: { create: { remoteJid: string } }) => ({ id: `ct-${create.remoteJid}` }));
    let n = 0;
    db.wAChat.create.mockImplementation(async () => ({ id: `chat-${++n}`, lastMessageAt: null }));
    db.wAChat.update.mockResolvedValue({});
  });

  it("crea el contacto con el nombre de la libreta y marca el origen", async () => {
    budget.remaining = 5;
    db.wAAddressBookEntry.findFirst.mockResolvedValue({ name: "Ana López" });
    await ingestBusinessAppMessages("acc1", [msg("5215511112222", "w1")] as never, "HISTORY");
    expect(db.contact.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ name: "Ana López", nameSource: "address_book", source: "whatsapp_history" }) }));
    expect(db.wAAddressBookEntry.deleteMany).toHaveBeenCalled();
  });

  it("al tope: el chat y sus mensajes se importan sin contacto y se avisa", async () => {
    budget.remaining = 1;
    const r = await ingestBusinessAppMessages("acc1", [msg("5215511112222", "w1"), msg("5215533334444", "w2"), msg("5215533334444", "w3")] as never, "HISTORY");
    expect(db.contact.upsert).toHaveBeenCalledTimes(1);
    expect(db.wAChat.create).toHaveBeenCalledTimes(2);
    expect(db.wAChat.create.mock.calls[1][0].data.contactId).toBeNull();
    expect(r.created).toBe(3);
    expect(r.chatsWithoutContact).toBe(1);
    expect(db.wAAccount.update).toHaveBeenCalledWith(expect.objectContaining({ data: { historySkippedChats: { increment: 1 }, historySkippedMessages: { increment: 2 } } }));
    expect(budget.notify).toHaveBeenCalled();
  });

  it("los ecos (conversación en vivo) no tienen tope", async () => {
    budget.remaining = 0;
    await ingestBusinessAppMessages("acc1", [msg("5215511112222", "w1")] as never, "BUSINESS_APP_ECHO");
    expect(db.contact.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ source: "whatsapp_echo" }) }));
  });
});
