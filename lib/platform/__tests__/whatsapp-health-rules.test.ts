import { describe, expect, it } from "vitest";
import { noticesFrom, whatsappVerdict } from "../whatsapp-health-rules";

describe("whatsappVerdict", () => {
  it("sin datos de Meta es unknown", () => {
    expect(whatsappVerdict(null)).toBe("unknown");
  });

  it("número conectado, nombre aprobado y AVAILABLE es ok", () => {
    expect(whatsappVerdict({ canSendMessage: "AVAILABLE", nameStatus: "APPROVED", numberStatus: "CONNECTED" })).toBe("ok");
  });

  it("nombre en revisión con LIMITED es limited (caso real del 2026-11-01)", () => {
    expect(whatsappVerdict({ canSendMessage: "LIMITED", nameStatus: "PENDING_REVIEW", numberStatus: "CONNECTED" })).toBe("limited");
  });

  it("nombre no aprobado basta para limited aunque Meta diga AVAILABLE", () => {
    expect(whatsappVerdict({ canSendMessage: "AVAILABLE", nameStatus: "DECLINED", numberStatus: "CONNECTED" })).toBe("limited");
  });

  it("BLOCKED o número baneado es blocked", () => {
    expect(whatsappVerdict({ canSendMessage: "BLOCKED", nameStatus: "APPROVED", numberStatus: "CONNECTED" })).toBe("blocked");
    expect(whatsappVerdict({ canSendMessage: "AVAILABLE", nameStatus: "APPROVED", numberStatus: "BANNED" })).toBe("blocked");
  });

  it("FLAGGED o RATE_LIMITED es limited, no blocked", () => {
    expect(whatsappVerdict({ canSendMessage: "AVAILABLE", nameStatus: "APPROVED", numberStatus: "FLAGGED" })).toBe("limited");
    expect(whatsappVerdict({ canSendMessage: null, nameStatus: "APPROVED", numberStatus: "RATE_LIMITED" })).toBe("limited");
  });
});

describe("noticesFrom", () => {
  it("junta avisos y errores por entidad y omite los de SIP", () => {
    const notices = noticesFrom([
      {
        entity_type: "PHONE_NUMBER",
        errors: [{ error_code: 138024, error_description: "SIP no habilitado" }],
        additional_info: ["Your display name has not been approved yet."],
      },
      { entity_type: "WABA", errors: [{ error_code: 141006, error_description: "Método de pago", possible_solution: "Agrega una tarjeta" }] },
    ]);
    expect(notices).toEqual([
      "PHONE_NUMBER: Your display name has not been approved yet.",
      "WABA: (#141006) Método de pago → Agrega una tarjeta",
    ]);
  });

  it("sin entidades no hay avisos", () => {
    expect(noticesFrom(undefined)).toEqual([]);
  });
});
