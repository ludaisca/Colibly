import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  const chatRow = { id: "chat1", status: "OPEN", snoozedUntil: null, assignedToId: null };
  const prismaMock = {
  wAMessage: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: "msg1" })) },
  contact: {
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async () => ({ id: "contact1", leadOrigin: "ORGANIC", adId: null })),
  },
  wAChat: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => chatRow), update: vi.fn() },
  wAAccount: { update: vi.fn(async () => ({})) },
  wABot: { findFirst: vi.fn(async () => ({ id: "bot1" })) },
  notification: { create: vi.fn(async () => ({})) },
  };
  return { prismaMock };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const botAdd = vi.fn();
vi.mock("@/lib/queue", () => ({ botQueue: { add: (...a: unknown[]) => botAdd(...a) }, mediaDownloadQueue: { add: vi.fn() } }));
vi.mock("@/lib/whatsapp/auto-assign", () => ({ autoAssignChat: vi.fn(async () => null) }));
vi.mock("@/lib/teams/teams", () => ({ accountDefaultTeamId: vi.fn(async () => null) }));
vi.mock("@/lib/whatsapp/address-book", () => ({ addressBookNameFor: vi.fn(async () => null), forgetAddressBookEntry: vi.fn(), shouldApplyProfileName: () => false }));
vi.mock("@/lib/billing/contact-limits", () => ({ afterContactCreated: vi.fn() }));
vi.mock("@/lib/notifications/push", () => ({ queuePush: vi.fn() }));
const emit = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/events/emit", () => ({ emitDomainEvent: (...a: unknown[]) => emit(...a) }));
const dispatch = vi.fn(async (..._a: unknown[]) => ({ suppressBot: false }));
vi.mock("@/lib/automations/dispatch", () => ({ dispatchInboundMessage: (...a: unknown[]) => dispatch(...a) }));
const markWaiting = vi.fn();
vi.mock("@/lib/chats/waiting", () => ({ markWaiting: (...a: unknown[]) => markWaiting(...a) }));
const away = vi.fn();
vi.mock("@/lib/inbox/away-message", () => ({ queueAwayMessage: (...a: unknown[]) => away(...a) }));
const queueWelcome = vi.fn();
vi.mock("@/lib/whatsapp/welcome", () => ({ WELCOME_TYPE: "request_welcome", WELCOME_BODY: "👋 Abrió el chat por primera vez", queueWelcomeMessage: (...a: unknown[]) => queueWelcome(...a) }));

import { ingestInboundMessage } from "@/lib/whatsapp/ingest-message";

const base = { remoteJid: "5215512345678", wamid: "wamid.1", timestamp: new Date("2026-11-13T20:00:00Z"), contactName: "Ana", isGroup: false };

describe("ingestInboundMessage con request_welcome", () => {
  beforeEach(() => vi.clearAllMocks());

  it("se guarda como aviso legible, saluda y no despierta bot, flujos ni espera", async () => {
    await ingestInboundMessage("acc1", { ...base, type: "request_welcome", body: "[request_welcome]" });
    const created = (prismaMock.wAMessage.create.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0];
    expect(created.data).toMatchObject({ messageType: "request_welcome", body: "👋 Abrió el chat por primera vez", direction: "INBOUND" });
    expect(queueWelcome).toHaveBeenCalledWith("chat1");
    expect(markWaiting).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(botAdd).not.toHaveBeenCalled();
    expect(away).not.toHaveBeenCalled();
    const types = emit.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain("conversation.welcome_requested");
    expect(types).toContain("contact.created");
    expect(types).not.toContain("message.received");
  });

  it("un mensaje normal sigue su camino de siempre", async () => {
    await ingestInboundMessage("acc1", { ...base, type: "text", body: "Hola" });
    expect(markWaiting).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
    expect(botAdd).toHaveBeenCalled();
    expect(queueWelcome).not.toHaveBeenCalled();
    expect(emit.mock.calls.map((c) => (c[0] as { type: string }).type)).toContain("message.received");
  });
});

describe("ingestInboundMessage con flow y pedido", () => {
  beforeEach(() => vi.clearAllMocks());

  it("una respuesta de Flow emite flow.completed con token y campos", async () => {
    await ingestInboundMessage("acc1", { ...base, type: "interactive", body: "📝 Respondió el formulario", content: { flowResponse: { flowToken: "t1", data: { fecha: "x" } } } });
    const ev = emit.mock.calls.map((c) => c[0] as { type: string; data: unknown }).find((e) => e.type === "flow.completed");
    expect(ev?.data).toEqual({ messageId: "msg1", flowToken: "t1", response: { fecha: "x" } });
  });

  it("un pedido emite order.received con el total", async () => {
    const order = { catalogId: "c1", text: null, items: [{ productId: "A", quantity: 2, price: 10, currency: "MXN" }] };
    await ingestInboundMessage("acc1", { ...base, type: "order", body: "🛒 Pedido", content: { order } });
    const ev = emit.mock.calls.map((c) => c[0] as { type: string; data: Record<string, unknown> }).find((e) => e.type === "order.received");
    expect(ev?.data).toMatchObject({ messageId: "msg1", catalogId: "c1", total: 20, currency: "MXN" });
  });
});
