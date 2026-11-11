import { describe, expect, it } from "vitest";
import { markdownToWhatsApp } from "../markdown-to-whatsapp";

describe("markdownToWhatsApp", () => {
  it("**negrita** y __negrita__ pasan a *negrita*", () => {
    expect(markdownToWhatsApp("El **facial** cuesta $850")).toBe("El *facial* cuesta $850");
    expect(markdownToWhatsApp("__Importante__: trae tu INE")).toBe("*Importante*: trae tu INE");
  });
  it("no toca lo que ya está en formato de WhatsApp", () => {
    expect(markdownToWhatsApp("Hola *Mariana*, tu cita es _mañana_ ~no hoy~")).toBe("Hola *Mariana*, tu cita es _mañana_ ~no hoy~");
  });
  it("títulos, listas y enlaces", () => {
    const md = "## Precios\n* Facial: **$850**\n+ Masaje: $1,200\n\nReserva en [nuestro sitio](https://spa.mx/citas)";
    expect(markdownToWhatsApp(md)).toBe("*Precios*\n- Facial: *$850*\n- Masaje: $1,200\n\nReserva en nuestro sitio (https://spa.mx/citas)");
  });
  it("tachado de Markdown y líneas horizontales", () => {
    expect(markdownToWhatsApp("~~$900~~ ahora $850\n\n---\n\nGracias")).toBe("~$900~ ahora $850\n\nGracias");
  });
  it("no toca código ni snake_case", () => {
    expect(markdownToWhatsApp("Usa `**no**` y ```\n**tampoco**\n``` en mi_variable_x")).toBe("Usa `**no**` y ```\n**tampoco**\n``` en mi_variable_x");
  });
  it("texto sin formato queda igual", () => {
    expect(markdownToWhatsApp("Abrimos de lunes a sábado, 9 a 19 h.")).toBe("Abrimos de lunes a sábado, 9 a 19 h.");
    expect(markdownToWhatsApp("2*3*4 = 24")).toBe("2*3*4 = 24");
  });
});
