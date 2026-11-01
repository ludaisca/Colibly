import { beforeEach, describe, expect, it, vi } from "vitest";

// Orden de las puertas de transcribeMessage(): lo delicado es no gastar un
// crédito cuando el audio no sirve (tamaño, falta de archivo, sin Gemini) y
// no volver a llamar a la IA si ya hay transcripción.

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  size: 1000,
  provider: "google" as "google" | "opencode",
  credit: true,
  reserve: vi.fn(),
  complete: vi.fn(),
  update: vi.fn(),
  usage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wAMessage: { findUnique: vi.fn(async () => state.row), update: state.update },
    channelMessage: { findUnique: vi.fn(async () => null), update: state.update },
  },
}));
vi.mock("fs", () => ({
  promises: {
    stat: vi.fn(async () => ({ size: state.size })),
    readFile: vi.fn(async () => Buffer.from("ogg")),
  },
}));
vi.mock("@/lib/whatsapp/media-store", () => ({ resolveAbsolutePath: (p: string) => `/media/${p}` }));
vi.mock("@/lib/ai/platform", () => ({
  resolvePlatformModel: vi.fn(async () => ({ provider: state.provider, model: "gemini-test" })),
  getPlatformApiKey: vi.fn(async () => "key"),
}));
vi.mock("@/lib/ai/credits", () => ({
  reserveAiCredit: vi.fn(async () => {
    state.reserve();
    return state.credit;
  }),
  hasAiCredits: vi.fn(async () => true),
}));
vi.mock("@/lib/billing/gates", () => ({ hasAiAccess: vi.fn(async () => true), isOrgWritable: vi.fn(async () => true) }));
vi.mock("@/lib/ai/assist-usage", () => ({ recordAssistUsage: state.usage }));
vi.mock("@/lib/ai/factory", () => ({ getAIProvider: () => ({ complete: state.complete }) }));
vi.mock("@/lib/queue", () => ({ inboxQueue: { add: vi.fn() } }));

import { TRANSCRIBE_MAX_BYTES, TranscribeError, transcribeMessage } from "../transcribe";

function audioRow(extra: Record<string, unknown> = {}) {
  return {
    id: "m1",
    messageType: "audio",
    mediaUrl: "acc/a.ogg",
    mimeType: "audio/ogg; codecs=opus",
    transcript: null,
    chat: { account: { organizationId: "org1" } },
    ...extra,
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error instanceof TranscribeError ? error.code : "other";
  }
}

describe("transcribeMessage", () => {
  beforeEach(() => {
    state.row = audioRow();
    state.size = 1000;
    state.provider = "google";
    state.credit = true;
    state.reserve.mockClear();
    state.complete.mockReset().mockResolvedValue({ content: " hola, quiero precios ", usage: { promptTokens: 10, completionTokens: 5 } });
    state.update.mockClear();
    state.usage.mockClear();
  });

  it("transcribe, guarda y registra el uso", async () => {
    await expect(transcribeMessage("whatsapp", "m1", { userId: "u1" })).resolves.toBe("hola, quiero precios");
    expect(state.reserve).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m1" }, data: expect.objectContaining({ transcript: "hola, quiero precios" }) }));
    expect(state.usage).toHaveBeenCalledWith(expect.objectContaining({ kind: "TRANSCRIBE", organizationId: "org1", userId: "u1" }));
    // El parámetro codecs del MIME no llega al data URI.
    const userPart = state.complete.mock.calls[0][0].messages[1].content[0];
    expect(userPart.audio_url.url.startsWith("data:audio/ogg;base64,")).toBe(true);
  });

  it("ya transcrito: devuelve el texto sin gastar crédito", async () => {
    state.row = audioRow({ transcript: "ya estaba" });
    await expect(transcribeMessage("whatsapp", "m1")).resolves.toBe("ya estaba");
    expect(state.reserve).not.toHaveBeenCalled();
    expect(state.complete).not.toHaveBeenCalled();
  });

  it("audio demasiado grande: error y sin crédito", async () => {
    state.size = TRANSCRIBE_MAX_BYTES + 1;
    expect(await codeOf(transcribeMessage("whatsapp", "m1"))).toBe("too_large");
    expect(state.reserve).not.toHaveBeenCalled();
  });

  it("sin Gemini no se gasta crédito", async () => {
    state.provider = "opencode";
    expect(await codeOf(transcribeMessage("whatsapp", "m1"))).toBe("unavailable");
    expect(state.reserve).not.toHaveBeenCalled();
  });

  it("no es audio / aún sin descargar", async () => {
    state.row = audioRow({ messageType: "image" });
    expect(await codeOf(transcribeMessage("whatsapp", "m1"))).toBe("not_audio");
    state.row = audioRow({ mediaUrl: null });
    expect(await codeOf(transcribeMessage("whatsapp", "m1"))).toBe("no_media");
    expect(state.reserve).not.toHaveBeenCalled();
  });

  it("sin créditos: no llama al proveedor", async () => {
    state.credit = false;
    expect(await codeOf(transcribeMessage("whatsapp", "m1"))).toBe("ai_credits");
    expect(state.complete).not.toHaveBeenCalled();
  });
});
