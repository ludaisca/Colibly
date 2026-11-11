import { describe, expect, it } from "vitest";
import { supportWhatsappNumber, supportWhatsappUrl } from "../support";
import { GLOSSARY } from "../glossary";

describe("soporte por WhatsApp", () => {
  it("sin variable o con un valor que no es un número, no hay botón", () => {
    expect(supportWhatsappNumber(undefined)).toBeNull();
    expect(supportWhatsappNumber("")).toBeNull();
    expect(supportWhatsappNumber("abc")).toBeNull();
    expect(supportWhatsappNumber("123")).toBeNull();
  });
  it("limpia el formato y arma el enlace con el texto prellenado", () => {
    const n = supportWhatsappNumber("+52 1 55 1234 5678");
    expect(n).toBe("5215512345678");
    const url = supportWhatsappUrl(n!, "Spa Aurora");
    expect(url.startsWith("https://wa.me/5215512345678?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hola, necesito ayuda con Colibly (org: Spa Aurora)");
  });
});

describe("glosario", () => {
  it("tiene los seis textos de ayuda y todos terminan en punto", () => {
    expect(Object.keys(GLOSSARY)).toHaveLength(6);
    for (const text of Object.values(GLOSSARY)) expect(text.endsWith(".")).toBe(true);
  });
});

describe("SUPPORT_WHATSAPP vacío o a medias", () => {
  it("espacios, solo lada o más de 15 dígitos: sin botón (nunca un wa.me/ vacío)", () => {
    expect(supportWhatsappNumber("   ")).toBeNull();
    expect(supportWhatsappNumber("+52")).toBeNull();
    expect(supportWhatsappNumber("1234567890123456")).toBeNull();
  });
  it("con un número válido el enlace siempre lleva el número", () => {
    expect(supportWhatsappUrl("5215512345678", null)).toMatch(/^https:\/\/wa\.me\/5215512345678\?text=/);
  });
});
