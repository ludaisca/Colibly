import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { changedUrls, chunk, INDEXNOW_KEY, indexNowPayload, shouldSubmit } from "../indexnow-rules";

describe("clave de IndexNow", () => {
  it("es hexadecimal de 8 a 128 caracteres", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{8,128}$/);
  });
  it("está publicada en public/<clave>.txt con la clave como único contenido", () => {
    const file = path.join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`);
    expect(readFileSync(file, "utf8").trim()).toBe(INDEXNOW_KEY);
  });
});

describe("changedUrls", () => {
  it("devuelve las nuevas y las que cambiaron, no las iguales", () => {
    const stored = { "https://x/a": "1", "https://x/b": "2" };
    const current = { "https://x/a": "1", "https://x/b": "9", "https://x/c": "3" };
    expect(changedUrls(current, stored)).toEqual(["https://x/b", "https://x/c"]);
  });
  it("sin nada guardado, envía todo; sin cambios, nada", () => {
    expect(changedUrls({ "https://x/a": "1" }, {})).toEqual(["https://x/a"]);
    expect(changedUrls({ "https://x/a": "1" }, { "https://x/a": "1" })).toEqual([]);
  });
});

describe("indexNowPayload y chunk", () => {
  it("arma el cuerpo del protocolo con la ubicación de la clave", () => {
    expect(indexNowPayload("colibly.com", ["https://colibly.com/blog"])).toEqual({
      host: "colibly.com",
      key: INDEXNOW_KEY,
      keyLocation: `https://colibly.com/${INDEXNOW_KEY}.txt`,
      urlList: ["https://colibly.com/blog"],
    });
  });
  it("parte las listas en lotes", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe("shouldSubmit", () => {
  it("solo en producción y con dominio público", () => {
    expect(shouldSubmit({ nodeEnv: "production", siteUrl: "https://colibly.com" })).toEqual({ host: "colibly.com" });
    expect(shouldSubmit({ nodeEnv: "development", siteUrl: "https://colibly.com" })).toBeNull();
    expect(shouldSubmit({ nodeEnv: "production", siteUrl: "http://localhost:1100" })).toBeNull();
    expect(shouldSubmit({ nodeEnv: "production", siteUrl: "http://127.0.0.1:1100" })).toBeNull();
    expect(shouldSubmit({ nodeEnv: "production", siteUrl: "https://ludaisca" })).toBeNull();
    expect(shouldSubmit({ nodeEnv: "production" })).toBeNull();
    expect(shouldSubmit({ nodeEnv: "production", siteUrl: "no es una url" })).toBeNull();
  });
});
