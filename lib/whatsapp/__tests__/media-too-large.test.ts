import { describe, it, expect, vi, beforeEach } from "vitest";

const msgFindFirst = vi.fn();
const accFindUnique = vi.fn();
const chatFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    wAMessage: { findFirst: (...a: unknown[]) => msgFindFirst(...a) },
    wAAccount: { findUnique: (...a: unknown[]) => accFindUnique(...a) },
    wAChat: { findFirst: (...a: unknown[]) => chatFindFirst(...a) },
  },
}));
const ingest = vi.fn();
vi.mock("@/lib/whatsapp/ingest-message", () => ({ ingestInboundMessage: (...a: unknown[]) => ingest(...a) }));

import { isMediaTooLargeStatus, mediaTooLargeNotice, parseSizeMb, recordMediaTooLarge } from "@/lib/whatsapp/media-too-large";

const status = {
  id: "wamid.HBgN",
  status: "failed",
  timestamp: "1793900000",
  recipient_id: "5214775575131",
  errors: [{ code: 131052, title: "Media file size too big", message: "Media file size too big 150.548046MB. Max file size we currently support: 100MB. Please communicate with your customer…" }],
};

describe("detección y texto", () => {
  it("solo el error 131052 en un estado failed", () => {
    expect(isMediaTooLargeStatus(status)).toBe(true);
    expect(isMediaTooLargeStatus({ ...status, errors: [{ code: "131052" }] })).toBe(true);
    expect(isMediaTooLargeStatus({ ...status, errors: [{ code: 131047 }] })).toBe(false);
    expect(isMediaTooLargeStatus({ ...status, status: "delivered" })).toBe(false);
    expect(isMediaTooLargeStatus({ id: "x", status: "failed" })).toBe(false);
  });

  it("lee el tamaño que dijo Meta", () => {
    expect(parseSizeMb(status)).toBe(150.5);
    expect(parseSizeMb({ errors: [{ code: 131052, message: "otra cosa" }] })).toBeNull();
  });

  it("el aviso cambia según haya teléfono conectado", () => {
    const withPhone = mediaTooLargeNotice({ maxMb: 100, sizeMb: 150.5, onPhone: true });
    expect(withPhone).toContain("150.5 MB");
    expect(withPhone).toContain("excede el tamaño máximo de 100 MB");
    expect(withPhone).toContain("teléfono conectado");
    const noPhone = mediaTooLargeNotice({ maxMb: 100, sizeMb: null, onPhone: false });
    expect(noPhone).not.toContain("teléfono conectado");
    expect(noPhone).toContain("más ligero");
  });
});

describe("recordMediaTooLarge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    msgFindFirst.mockResolvedValue(null);
    accFindUnique.mockResolvedValue({ coexistence: true });
    chatFindFirst.mockResolvedValue(null);
    ingest.mockResolvedValue({ messageId: "m1", chatId: "c1" });
  });

  it("guarda el aviso como mensaje entrante marcado como aviso", async () => {
    expect(await recordMediaTooLarge("acc1", status)).toBe(true);
    const [accountId, msg] = ingest.mock.calls[0] as [string, Record<string, unknown>];
    expect(accountId).toBe("acc1");
    expect(msg).toMatchObject({ remoteJid: "5214775575131", wamid: "wamid.HBgN", type: "media_too_large", notice: true, isGroup: false });
    expect(msg.content).toMatchObject({ kind: "media_too_large", maxMb: 100, sizeMb: 150.5, onPhone: true });
    expect(String(msg.body)).toContain("teléfono conectado");
    expect((msg.timestamp as Date).toISOString()).toBe(new Date(1793900000 * 1000).toISOString());
  });

  it("usa el chat existente aunque esté guardado como 521…", async () => {
    chatFindFirst.mockResolvedValue({ remoteJid: "5214775575131", name: "Ana" });
    await recordMediaTooLarge("acc1", { ...status, recipient_id: "524775575131" });
    expect(chatFindFirst.mock.calls[0][0].where.remoteJid.in).toEqual(["524775575131", "5214775575131"]);
    expect(ingest.mock.calls[0][1]).toMatchObject({ remoteJid: "5214775575131", contactName: "Ana" });
  });

  it("un reintento de Meta sobre un aviso ya guardado cuenta como atendido, sin duplicar", async () => {
    msgFindFirst.mockResolvedValue({ id: "ya", messageType: "media_too_large" });
    expect(await recordMediaTooLarge("acc1", status)).toBe(true);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("si el wamid es de otro mensaje (un envío propio rechazado) no lo toca", async () => {
    msgFindFirst.mockResolvedValue({ id: "propio", messageType: "video" });
    expect(await recordMediaTooLarge("acc1", status)).toBe(false);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("sin cuenta de coexistencia el aviso no manda al teléfono", async () => {
    accFindUnique.mockResolvedValue({ coexistence: false });
    await recordMediaTooLarge("acc1", status);
    expect(ingest.mock.calls[0][1]).toMatchObject({ content: { onPhone: false } });
    expect(String((ingest.mock.calls[0][1] as { body: string }).body)).not.toContain("teléfono conectado");
  });

  it("devuelve false si el ingest lo descartó por duplicado y si falta destinatario", async () => {
    ingest.mockResolvedValue(null);
    expect(await recordMediaTooLarge("acc1", status)).toBe(false);
    expect(await recordMediaTooLarge("acc1", { ...status, recipient_id: undefined })).toBe(false);
  });
});
