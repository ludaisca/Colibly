import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { wAMessage: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));

import { getChatServiceWindow, serviceWindowFrom } from "@/lib/whatsapp/service-window";

const now = new Date("2026-10-19T12:00:00Z");

describe("ventana de 24 h", () => {
  beforeEach(() => findFirst.mockReset());

  it("abierta si el último entrante tiene menos de 24 h", () => {
    const w = serviceWindowFrom(new Date("2026-10-18T13:00:00Z"), now);
    expect(w.open).toBe(true);
    expect(w.expiresAt).toBe("2026-10-19T13:00:00.000Z");
  });
  it("cerrada justo a las 24 h", () => {
    expect(serviceWindowFrom(new Date("2026-10-18T12:00:00Z"), now).open).toBe(false);
  });
  it("cerrada sin ningún entrante", () => {
    expect(serviceWindowFrom(null, now)).toEqual({ open: false, lastInboundAt: null, expiresAt: null });
  });
  it("consulta solo entrantes del chat, el más reciente", async () => {
    findFirst.mockResolvedValue({ timestamp: new Date("2026-10-16T10:00:00Z") });
    const w = await getChatServiceWindow("chat1", now);
    expect(w.open).toBe(false);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { chatId: "chat1", direction: "INBOUND" }, orderBy: { timestamp: "desc" } }));
  });
});
