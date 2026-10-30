import { describe, expect, it } from "vitest";
import { isValidRedirectUri, pkceChallenge } from "../oauth";

describe("pkceChallenge", () => {
  it("coincide con el ejemplo de RFC 7636", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("isValidRedirectUri", () => {
  it("acepta https y localhost http", () => {
    expect(isValidRedirectUri("https://cliente.example/callback")).toBe(true);
    expect(isValidRedirectUri("http://localhost:9999/callback")).toBe(true);
    expect(isValidRedirectUri("http://127.0.0.1/callback")).toBe(true);
  });

  it("rechaza http remoto, fragmentos y basura", () => {
    expect(isValidRedirectUri("http://cliente.example/callback")).toBe(false);
    expect(isValidRedirectUri("https://cliente.example/callback#x")).toBe(false);
    expect(isValidRedirectUri("no-es-url")).toBe(false);
  });
});
