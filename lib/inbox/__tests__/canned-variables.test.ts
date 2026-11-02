import { describe, expect, it } from "vitest";
import { renderCannedResponse } from "../canned-variables";

const ctx = { contactName: "Ana López", remoteJid: "5215512345678", agentName: "Luis", businessName: "Florería Sol" };

describe("renderCannedResponse", () => {
  it("reemplaza nombre, agente y negocio (sin importar mayúsculas ni espacios)", () => {
    expect(renderCannedResponse("Hola {{nombre}}, soy {{ Agente }} de {{NEGOCIO}}.", ctx)).toBe("Hola Ana López, soy Luis de Florería Sol.");
  });
  it("una variable desconocida se queda tal cual para que el agente la vea", () => {
    expect(renderCannedResponse("Tu pedido {{pedido}} va en camino", ctx)).toBe("Tu pedido {{pedido}} va en camino");
  });
  it("si el nombre es solo el número, queda vacío sin dejar espacios raros", () => {
    expect(renderCannedResponse("Hola {{nombre}}, ¿cómo estás?", { ...ctx, contactName: "5215512345678" })).toBe("Hola, ¿cómo estás?");
    expect(renderCannedResponse("Hola {{nombre}}, ¿cómo estás?", { ...ctx, contactName: null })).toBe("Hola, ¿cómo estás?");
  });
  it("sin variables el texto no cambia (ni sus espacios)", () => {
    expect(renderCannedResponse("Precio:  $200 .", ctx)).toBe("Precio:  $200 .");
  });
});
