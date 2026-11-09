import { describe, expect, it } from "vitest";
import { handleMatches, phoneDigitsOf } from "../search-terms";

describe("phoneDigitsOf", () => {
  it("extrae dígitos de un teléfono con formato", () => {
    expect(phoneDigitsOf("+52 55 1234-5678")).toBe("525512345678");
    expect(phoneDigitsOf("(55) 1234 5678")).toBe("5512345678");
  });
  it("ignora nombres, textos con letras y números ya limpios o cortos", () => {
    expect(phoneDigitsOf("Ana 55")).toBeNull();
    expect(phoneDigitsOf("5512345678")).toBeNull();
    expect(phoneDigitsOf("5 5")).toBeNull();
  });
});

describe("handleMatches", () => {
  it("encuentra por texto literal y por dígitos", () => {
    expect(handleMatches("5215512345678", "55123")).toBe(true);
    expect(handleMatches("5215512345678", "55 1234 5678")).toBe(true);
    expect(handleMatches("5215512345678", "99 1234")).toBe(false);
  });
});
