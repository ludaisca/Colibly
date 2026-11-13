import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Simulaciones ──────────────────────────────────────────────────────────
const chatFindUnique = vi.fn();
const msgFindFirst = vi.fn();
const accUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    wAChat: { findUnique: (...a: unknown[]) => chatFindUnique(...a) },
    wAMessage: { findFirst: (...a: unknown[]) => msgFindFirst(...a) },
    wAAccount: { update: (...a: unknown[]) => accUpdate(...a) },
  },
}));
const queueAdd = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock("@/lib/queue", () => ({ inboxQueue: { add: (...a: unknown[]) => queueAdd(...a) } }));
const writable = vi.fn(async (..._a: unknown[]) => true);
vi.mock("@/lib/billing/gates", () => ({ isOrgWritable: (...a: unknown[]) => writable(...a) }));
const sendOutbound = vi.fn(async (..._a: unknown[]) => ({ messageId: "out1" }));
vi.mock("@/lib/messaging/outbound", () => ({
  sendOutbound: (...a: unknown[]) => sendOutbound(...a),
  OutboundError: class OutboundError extends Error { constructor(public code: string, m: string) { super(m); } },
}));
const setMeta = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/whatsapp/account-admin", () => ({ setMetaWelcomeMessage: (...a: unknown[]) => setMeta(...a) }));

import { configureWelcomeMessage, processWelcomeJob, queueWelcomeMessage, welcomeSkipReason, WelcomeConfigError } from "@/lib/whatsapp/welcome";
import type { WAAccount } from "@prisma/client";

const account = { id: "acc1", organizationId: "org1", channel: "META_CLOUD", phoneNumberId: "pn1", accessToken: "enc", welcomeMessageEnabled: true, welcomeMessageText: "¡Hola! ¿En qué te ayudamos?" };

describe("welcomeSkipReason", () => {
  const ok = { enabled: true, text: "Hola", alreadyAnswered: false, writable: true };
  it("manda solo con todo en orden", () => {
    expect(welcomeSkipReason(ok)).toBeNull();
    expect(welcomeSkipReason({ ...ok, enabled: false })).toBe("disabled");
    expect(welcomeSkipReason({ ...ok, text: "  " })).toBe("no_text");
    expect(welcomeSkipReason({ ...ok, alreadyAnswered: true })).toBe("answered");
    expect(welcomeSkipReason({ ...ok, writable: false })).toBe("read_only");
  });
});

describe("processWelcomeJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatFindUnique.mockResolvedValue({ id: "chat1", account });
    msgFindFirst.mockResolvedValue(null);
  });

  it("saluda con el texto de la cuenta sin contar como respuesta", async () => {
    expect(await processWelcomeJob({ chatId: "chat1" })).toBe("sent");
    expect(sendOutbound.mock.calls[0][1]).toEqual({ type: "text", text: "¡Hola! ¿En qué te ayudamos?" });
    expect(sendOutbound.mock.calls[0][2]).toMatchObject({ source: "automation", countsAsReply: false });
  });

  it("no saluda si alguien ya le escribió o la cuenta lo apagó", async () => {
    msgFindFirst.mockResolvedValue({ id: "out0" });
    expect(await processWelcomeJob({ chatId: "chat1" })).toBe("answered");
    msgFindFirst.mockResolvedValue(null);
    chatFindUnique.mockResolvedValue({ id: "chat1", account: { ...account, welcomeMessageEnabled: false } });
    expect(await processWelcomeJob({ chatId: "chat1" })).toBe("disabled");
    expect(sendOutbound).not.toHaveBeenCalled();
  });

  it("el job se encola una sola vez por chat", async () => {
    await queueWelcomeMessage("chat1");
    expect(queueAdd).toHaveBeenCalledWith("welcome-message", { chatId: "chat1" }, { jobId: "welcome-chat1" });
  });
});

describe("configureWelcomeMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accUpdate.mockImplementation(async ({ data }: { data: { welcomeMessageEnabled: boolean; welcomeMessageText: string | null } }) => data);
  });

  it("solo llama a Meta si cambia el interruptor, y Meta va primero", async () => {
    await configureWelcomeMessage({ ...account, welcomeMessageEnabled: false } as unknown as WAAccount, { enabled: true, text: " Hola " });
    expect(setMeta).toHaveBeenCalledWith(expect.objectContaining({ id: "acc1" }), true);
    expect(accUpdate.mock.calls[0][0].data).toEqual({ welcomeMessageEnabled: true, welcomeMessageText: "Hola" });

    vi.clearAllMocks();
    await configureWelcomeMessage(account as unknown as WAAccount, { enabled: true, text: "Otro" });
    expect(setMeta).not.toHaveBeenCalled();
  });

  it("si Meta falla no se guarda nada", async () => {
    setMeta.mockRejectedValueOnce(new Error("Meta caída"));
    await expect(configureWelcomeMessage({ ...account, welcomeMessageEnabled: false } as unknown as WAAccount, { enabled: true })).rejects.toThrow("Meta caída");
    expect(accUpdate).not.toHaveBeenCalled();
  });

  it("text undefined conserva el actual; null lo borra; rechaza cuentas sin Cloud API", async () => {
    await configureWelcomeMessage(account as unknown as WAAccount, { enabled: true });
    expect(accUpdate.mock.calls[0][0].data.welcomeMessageText).toBe(account.welcomeMessageText);
    await configureWelcomeMessage(account as unknown as WAAccount, { enabled: true, text: null });
    expect(accUpdate.mock.calls[1][0].data.welcomeMessageText).toBeNull();
    await expect(configureWelcomeMessage({ ...account, phoneNumberId: null } as unknown as WAAccount, { enabled: true })).rejects.toBeInstanceOf(WelcomeConfigError);
  });
});
