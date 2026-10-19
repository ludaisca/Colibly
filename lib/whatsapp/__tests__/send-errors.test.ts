import { describe, it, expect } from "vitest";
import { metaSendErrorMessage, MetaSendError } from "@/lib/whatsapp/send-errors";

describe("metaSendErrorMessage", () => {
  it("traduce la ventana cerrada (131047)", () => {
    expect(metaSendErrorMessage(131047, "Re-engagement message")).toMatch(/24 h/);
  });
  it("traduce los problemas de pago (141006 y 131042)", () => {
    expect(metaSendErrorMessage(141006)).toMatch(/método de pago/);
    expect(metaSendErrorMessage(131042)).toMatch(/método de pago/);
  });
  it("da un mensaje de plantilla para cualquier 132xxx", () => {
    expect(metaSendErrorMessage(132001)).toMatch(/idioma/);
    expect(metaSendErrorMessage(132999, "raw")).toMatch(/plantilla/);
  });
  it("conserva el detalle de Meta para códigos desconocidos", () => {
    expect(metaSendErrorMessage(999999, "Detalle de Meta")).toBe("Detalle de Meta");
    expect(metaSendErrorMessage(null, "  ")).toBe("WhatsApp no pudo enviar el mensaje.");
  });
  it("MetaSendError conserva el código", () => {
    const err = new MetaSendError("x", 131047);
    expect(err).toBeInstanceOf(Error);
    expect(err.metaCode).toBe(131047);
  });
});
