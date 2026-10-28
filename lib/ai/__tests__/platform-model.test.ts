import { describe, expect, it } from "vitest";
import { selectCuratedModel } from "@/lib/ai/platform";

const both = new Set(["opencode", "google"] as const);

describe("selectCuratedModel", () => {
  it("usa OpenCode para texto aunque Gemini también esté configurado", () => {
    expect(selectCuratedModel(both)).toEqual({
      provider: "opencode",
      model: "glm-5.3-flash",
    });
  });

  it("usa el modelo de texto y el de imágenes elegidos en la plataforma", () => {
    const prefs = { text: "kimi-k3", vision: "deepseek-v4.1-flash" };
    expect(selectCuratedModel(both, {}, prefs)).toEqual({ provider: "opencode", model: "kimi-k3" });
    expect(selectCuratedModel(both, { needsVision: true }, prefs)).toEqual({
      provider: "opencode",
      model: "deepseek-v4.1-flash",
    });
  });

  it("acepta el prefijo viejo opencode-go/", () => {
    expect(selectCuratedModel(both, {}, { text: "opencode-go/glm-5.3-flash" })).toEqual({
      provider: "opencode",
      model: "glm-5.3-flash",
    });
  });

  it("no manda a OpenCode un id de Gemini guardado por error", () => {
    expect(selectCuratedModel(both, {}, { text: "gemini-3.8-flash" })).toEqual({
      provider: "opencode",
      model: "glm-5.3-flash",
    });
    expect(selectCuratedModel(both, { needsVision: true }, { text: "kimi-k3", vision: "gemini-3.8-flash" })).toEqual({
      provider: "opencode",
      model: "glm-5.3-flash",
    });
  });

  it("deja el audio en Gemini", () => {
    expect(selectCuratedModel(both, { needsAudio: true })).toEqual({
      provider: "google",
      model: "gemini-3.8-flash",
    });
  });

  it("cae a Gemini si OpenCode no tiene llave", () => {
    expect(selectCuratedModel(new Set(["google"]))).toEqual({
      provider: "google",
      model: "gemini-3.8-flash",
    });
  });
});
