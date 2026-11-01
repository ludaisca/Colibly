import { describe, expect, it } from "vitest";
import { amountValue, formatAmountValue, parseAmount, reformatWithCaret, renderAmount } from "../currency-input";

describe("currency-input", () => {
  it("agrupa miles mientras se escribe y limita a 2 decimales", () => {
    expect(renderAmount(parseAmount("1250"), false)).toBe("1,250");
    expect(renderAmount(parseAmount("1250.5"), false)).toBe("1,250.5");
    expect(renderAmount(parseAmount("1250.567"), false)).toBe("1,250.56");
    expect(renderAmount(parseAmount("12500000"), false)).toBe("12,500,000");
  });
  it("ignora símbolos, letras, negativos y ceros a la izquierda", () => {
    expect(renderAmount(parseAmount("$ 0012,5a00"), false)).toBe("12,500");
    expect(renderAmount(parseAmount("-50"), false)).toBe("50");
  });
  it("al salir completa los decimales; vacío se queda vacío", () => {
    expect(renderAmount(parseAmount("1250.5"), true)).toBe("1,250.50");
    expect(renderAmount(parseAmount(".5"), true)).toBe("0.50");
    expect(renderAmount(parseAmount(""), true)).toBe("");
  });
  it("valor canónico para el servidor", () => {
    expect(amountValue("12,500")).toBe("12500.00");
    expect(amountValue("3,250.7")).toBe("3250.70");
    expect(amountValue("")).toBe("");
  });
  it("de número a texto visible", () => {
    expect(formatAmountValue(3250.75)).toBe("3,250.75");
    expect(formatAmountValue(null)).toBe("");
  });
  it("el cursor se queda detrás del mismo dígito aunque aparezca una coma", () => {
    // "1250|" → "1,250|"
    expect(reformatWithCaret("1250", 4)).toEqual({ text: "1,250", caret: 5 });
    // escribir un 5 al inicio de "1,250": "51,250" con cursor tras el 5 → "51,250" caret 1
    expect(reformatWithCaret("51,250", 1)).toEqual({ text: "51,250", caret: 1 });
    // "999|" + "9" → "9,999|"
    expect(reformatWithCaret("9999", 4)).toEqual({ text: "9,999", caret: 5 });
  });
});
