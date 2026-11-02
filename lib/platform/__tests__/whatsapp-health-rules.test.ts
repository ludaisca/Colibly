import { describe, expect, it } from "vitest";
import { canSendLabel, messagingLimitLabel, nameStatusLabel, noticesFrom, qualityLabel, whatsappVerdict } from "../whatsapp-health-rules";

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
      "Número: Meta todavía no aprueba el nombre para mostrar. El límite de mensajes aumentará cuando lo apruebe.",
      "Cuenta de WhatsApp Business: (#141006) Hay un problema con el método de pago. Esto bloquea las conversaciones iniciadas por el negocio. → Agrega un método de pago nuevo a la cuenta en el Administrador de WhatsApp.",
    ]);
  });

  it("sin entidades no hay avisos", () => {
    expect(noticesFrom(undefined)).toEqual([]);
  });
});

describe("traducción de textos de Meta", () => {
  it("traduce los errores conocidos y la entidad", () => {
    const notices = noticesFrom([{ entity_type: "BUSINESS", errors: [{ error_code: 141010, error_description: "The Business has not passed business verification." }] }]);
    expect(notices).toEqual(["Negocio: (#141010) El negocio no ha pasado la verificación de negocio. → Entra a la configuración del negocio en Meta e inicia o resuelve la solicitud de verificación."]);
  });

  it("un código o aviso desconocido se muestra tal como llega", () => {
    const notices = noticesFrom([{ entity_type: "OTHER", errors: [{ error_code: 999, error_description: "Something new", possible_solution: "Do it" }], additional_info: ["New info"] }]);
    expect(notices).toEqual(["OTHER: New info", "OTHER: (#999) Something new → Do it"]);
  });

  it("etiquetas de estado, calidad y límite", () => {
    expect(nameStatusLabel("AVAILABLE_WITHOUT_REVIEW")).toBe("disponible sin revisión");
    expect(nameStatusLabel("PENDING_REVIEW")).toBe("en revisión");
    expect(canSendLabel("BLOCKED")).toBe("bloqueado");
    expect(qualityLabel("GREEN")).toBe("alta");
    expect(messagingLimitLabel("TIER_250")).toBe("250 clientes / 24 h");
    expect(nameStatusLabel("NUEVO_ESTADO")).toBe("NUEVO_ESTADO");
    expect(canSendLabel(null)).toBe("—");
  });
});
