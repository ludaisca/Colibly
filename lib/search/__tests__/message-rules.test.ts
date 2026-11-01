import { describe, expect, it } from "vitest";
import { escapeLikePattern, messageSnippet, normalizeMessageQuery } from "../message-rules";

describe("normalizeMessageQuery", () => {
  it("recorta, colapsa espacios y valida el rango", () => {
    expect(normalizeMessageQuery("  precio   envío ")).toBe("precio envío");
    expect(normalizeMessageQuery("ab")).toBeNull();
    expect(normalizeMessageQuery(" a  ")).toBeNull();
    expect(normalizeMessageQuery("x".repeat(101))).toBeNull();
    expect(normalizeMessageQuery(null)).toBeNull();
  });
});

describe("escapeLikePattern", () => {
  it("escapa comodines y la barra", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("c:\\x")).toBe("c:\\\\x");
    expect(escapeLikePattern("hola")).toBe("hola");
  });
});

describe("messageSnippet", () => {
  it("centra la coincidencia y marca los cortes", () => {
    const long = `${"a ".repeat(60)}PRECIO del paquete${" b".repeat(60)}`;
    const s = messageSnippet([long], "precio", 20);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s).toContain("PRECIO del paquete");
  });
  it("busca en el pie de foto o la transcripción si el texto no coincide", () => {
    expect(messageSnippet([null, "foto del recibo", "quiero factura"], "factura")).toBe("quiero factura");
  });
  it("sin coincidencia devuelve el primer campo", () => {
    expect(messageSnippet(["hola", null], "zzz")).toBe("hola");
  });
});
