import { describe, it, expect, vi, beforeEach } from "vitest";

const chatFindFirst = vi.fn();
const chatUpdate = vi.fn();
const msgFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    wAChat: { findFirst: (...a: unknown[]) => chatFindFirst(...a), update: (...a: unknown[]) => chatUpdate(...a) },
    wAMessage: { findFirst: (...a: unknown[]) => msgFindFirst(...a) },
  },
}));
const resolveChatChannel = vi.fn();
vi.mock("@/lib/chat-resolver", () => ({ resolveChatChannel: (...a: unknown[]) => resolveChatChannel(...a) }));
const rateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => rateLimit(...a) }));
const sendOutbound = vi.fn();
vi.mock("@/lib/messaging/outbound", async () => {
  class OutboundError extends Error {
    constructor(public code: string, message: string, public metaCode: number | null = null) { super(message); }
  }
  return { sendOutbound: (...a: unknown[]) => sendOutbound(...a), OutboundError };
});
vi.mock("@/lib/billing/gates", () => ({
  BillingBlockedError: class BillingBlockedError extends Error { constructor() { super("Solo lectura"); } },
}));
vi.mock("@/lib/events/refs", () => ({ eventRefsForChat: vi.fn(async () => ({ chat: { kind: "whatsapp", id: "chat1" } })) }));
const pauseConversationalRuns = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/automations/dispatch", () => ({ pauseConversationalRuns: (...a: unknown[]) => pauseConversationalRuns(...a) }));

import { sendTemplateToChat } from "@/lib/whatsapp/chat-template-send";
import { OutboundError } from "@/lib/messaging/outbound";
import { BillingBlockedError } from "@/lib/billing/gates";

const chat = { id: "chat1", accountId: "acc1", firstResponseAt: null, account: { id: "acc1", organizationId: "org1" } };

describe("sendTemplateToChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.mockResolvedValue({ allowed: true });
    resolveChatChannel.mockResolvedValue({ channel: "WHATSAPP", accountIds: ["acc1"] });
    chatFindFirst.mockResolvedValue(chat);
    sendOutbound.mockResolvedValue({ messageId: "m1", externalId: "wamid.1" });
    msgFindFirst.mockResolvedValue({ id: "m1", messageType: "template", body: "Hola Ana", status: "sent" });
  });

  it("envía por sendOutbound como agente, acotado a las cuentas del usuario", async () => {
    const res = await sendTemplateToChat("chat1", "u1", { templateId: "t1", bodyParams: ["Ana"] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "m1", body: "Hola Ana" });
    expect(chatFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "chat1", accountId: { in: ["acc1"] } } }));
    expect(sendOutbound).toHaveBeenCalledWith(
      { kind: "whatsapp", chat },
      { type: "template", templateId: "t1", bodyParams: ["Ana"], headerParam: null, buttonParam: null },
      { source: "agent", senderId: "u1" }
    );
    expect(chatUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { firstResponseAt: expect.any(Date) } }));
    expect(pauseConversationalRuns).toHaveBeenCalled();
  });

  it("rechaza chats de otros canales", async () => {
    resolveChatChannel.mockResolvedValue({ channel: "TELEGRAM", accountIds: ["x"] });
    expect((await sendTemplateToChat("chat1", "u1", { templateId: "t1" })).status).toBe(400);
    expect(sendOutbound).not.toHaveBeenCalled();
  });

  it("404 si el chat no es de una cuenta accesible", async () => {
    chatFindFirst.mockResolvedValue(null);
    expect((await sendTemplateToChat("chat1", "u1", { templateId: "t1" })).status).toBe(404);
  });

  it("valida variables vacías", async () => {
    const res = await sendTemplateToChat("chat1", "u1", { templateId: "t1", bodyParams: [" "] });
    expect(res.status).toBe(400);
    expect(sendOutbound).not.toHaveBeenCalled();
  });

  it("respeta el límite de envíos", async () => {
    rateLimit.mockResolvedValue({ allowed: false });
    expect((await sendTemplateToChat("chat1", "u1", { templateId: "t1" })).status).toBe(429);
  });

  it("403 en solo lectura", async () => {
    sendOutbound.mockRejectedValue(new BillingBlockedError());
    const res = await sendTemplateToChat("chat1", "u1", { templateId: "t1" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("billing_blocked");
  });

  it("traduce el código de Meta del rechazo síncrono", async () => {
    sendOutbound.mockRejectedValue(new OutboundError("upstream_error", "Payment issue", 141006));
    const res = await sendTemplateToChat("chat1", "u1", { templateId: "t1" });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/método de pago/);
    expect(res.body.metaCode).toBe(141006);
  });

  it("propaga la validación de plantilla no aprobada", async () => {
    sendOutbound.mockRejectedValue(new OutboundError("invalid_request", 'La plantilla "x" no está aprobada (PENDING)'));
    const res = await sendTemplateToChat("chat1", "u1", { templateId: "t1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no está aprobada/);
  });
});
