import { beforeEach, describe, expect, it, vi } from "vitest";

// Orden de las puertas de transcribeMessage(): lo delicado es no gastar un
// crédito cuando el audio no sirve (tamaño, falta de archivo, sin proveedor),
// no volver a llamar a la IA si ya hay transcripción, y probar OpenCode antes
// que Gemini.

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  size: 1000,
  keys: { opencode: "oc-key", google: "g-key" } as Record<string, string | null>,
  providers: [] as string[],
  credit: true,
  reserve: vi.fn(),
  complete: vi.fn(),
  update: vi.fn(),
  usage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wAMessage: { findUnique: vi.fn(async () => state.row), updateMany: state.update },
    channelMessage: { findUnique: vi.fn(async () => null), updateMany: state.update },
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
  getPlatformApiKey: vi.fn(async (provider: string) => state.keys[provider] ?? null),
}));
vi.mock("@/lib/ai/credits", () => ({
  AI_CREDITS_EXHAUSTED_MESSAGE: "Se acabaron tus créditos de IA de este mes.",
  reserveAiCredit: vi.fn(async () => {
    state.reserve();
    return state.credit;
  }),
  hasAiCredits: vi.fn(async () => true),
}));
vi.mock("@/lib/billing/gates", () => ({ isOrgWritable: vi.fn(async () => true) }));
// La licencia de quien transcribe (o del dueño del canal) incluye IA.
vi.mock("@/lib/billing/entitlements", () => ({ userFeatureMessage: vi.fn(async () => null), channelFeatureMessage: vi.fn(async () => null) }));
vi.mock("@/lib/ai/assist-usage", () => ({ recordAssistUsage: state.usage }));
vi.mock("@/lib/ai/factory", () => ({
  getAIProvider: (provider: string) => ({
    complete: (params: unknown) => {
      state.providers.push(provider);
      return state.complete(provider, params);
    },
  }),
}));
vi.mock("@/lib/queue", () => ({ inboxQueue: { add: vi.fn() } }));

import { TRANSCRIBE_MAX_BYTES, TranscribeError, transcribeMessage } from "../transcribe";

function audioRow(extra: Record<string, unknown> = {}) {
  return {
    id: "m1",
    messageType: "audio",
    mediaUrl: "acc/a.ogg",
    mimeType: "audio/ogg; codecs=opus",
    transcript: null,
    chat: { accountId: "acc1", account: { organizationId: "org1" } },
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
    state.keys = { opencode: "oc-key", google: "g-key" };
    state.providers = [];
    state.credit = true;
    state.reserve.mockClear();
    state.complete.mockReset().mockResolvedValue({ content: " hola, quiero precios ", usage: { promptTokens: 10, completionTokens: 5 } });
    state.update.mockClear();
    state.usage.mockClear();
  });

  it("transcribe con OpenCode (MiMo, sin razonamiento), guarda y registra el uso", async () => {
    await expect(transcribeMessage("whatsapp", "m1", { userId: "u1" })).resolves.toBe("hola, quiero precios");
    expect(state.providers).toEqual(["opencode"]);
    expect(state.reserve).toHaveBeenCalledTimes(1);
    // No pisa una transcripción que haya llegado antes (bot y job a la vez).
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m1", transcript: null }, data: expect.objectContaining({ transcript: "hola, quiero precios" }) }));
    expect(state.usage).toHaveBeenCalledWith(expect.objectContaining({ kind: "TRANSCRIBE", organizationId: "org1", userId: "u1", provider: "opencode", model: "mimo-v2.6-flash" }));
    const params = state.complete.mock.calls[0][1];
    expect(params.model).toBe("mimo-v2.6-flash");
    expect(params.disableThinking).toBe(true);
    // El parámetro codecs del MIME no llega al data URI.
    expect(params.messages[1].content[0].audio_url.url.startsWith("data:audio/ogg;base64,")).toBe(true);
  });

  it("si OpenCode falla o responde vacío, cae a Gemini con el mismo crédito", async () => {
    state.complete.mockImplementation(async (provider: string) => {
      if (provider === "opencode") throw new Error("503");
      return { content: "desde gemini", usage: { promptTokens: 1, completionTokens: 1 } };
    });
    await expect(transcribeMessage("whatsapp", "m1")).resolves.toBe("desde gemini");
    expect(state.providers).toEqual(["opencode", "google"]);
    expect(state.reserve).toHaveBeenCalledTimes(1);

    state.providers = [];
    state.complete.mockImplementation(async (provider: string) => ({ content: provider === "opencode" ? "  " : "otra vez gemini" }));
    await expect(transcribeMessage("whatsapp", "m1")).resolves.toBe("otra vez gemini");
    expect(state.providers).toEqual(["opencode", "google"]);
  });

  it("solo con Gemini configurado, usa Gemini", async () => {
    state.keys = { opencode: null, google: "g-key" };
    await transcribeMessage("whatsapp", "m1");
    expect(state.providers).toEqual(["google"]);
  });

  it("si ningún proveedor transcribe: error claro y no se guarda nada", async () => {
    state.complete.mockRejectedValue(new Error("caído"));
    expect(await codeOf(transcribeMessage("whatsapp", "m1"))).toBe("failed");
    expect(state.update).not.toHaveBeenCalled();
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

  it("sin ningún proveedor configurado no se gasta crédito", async () => {
    state.keys = { opencode: null, google: null };
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
