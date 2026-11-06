import { describe, it, expect } from "vitest";
import { interpretStatusEvent } from "@/lib/whatsapp/template-events";

describe("interpretStatusEvent", () => {
  it("APPROVED y REINSTATED dejan la plantilla enviable y avisan", () => {
    for (const event of ["APPROVED", "REINSTATED", "approved"]) {
      expect(interpretStatusEvent({ event }, "promo")).toMatchObject({ status: "APPROVED", reason: null, notify: true });
    }
  });

  it("REJECTED guarda el motivo en español y avisa", () => {
    const c = interpretStatusEvent({ event: "REJECTED", reason: "INVALID_FORMAT", message_template_name: "promo" }, "x")!;
    expect(c.status).toBe("REJECTED");
    expect(c.reason).toBe("formato no válido");
    expect(c.title).toContain('"promo"');
    expect(c.notify).toBe(true);
    expect(interpretStatusEvent({ event: "REJECTED", reason: "NONE", other_info: { description: "Revisa el texto" } }, "x")!.reason).toBe("Revisa el texto");
    expect(interpretStatusEvent({ event: "REJECTED", reason: "SOMETHING_NEW" }, "x")!.reason).toBe("something new");
  });

  it("PAUSED y DISABLED traen un motivo por defecto", () => {
    expect(interpretStatusEvent({ event: "PAUSED" }, "x")).toMatchObject({ status: "PAUSED", reason: "pausada por baja calidad", notify: true });
    expect(interpretStatusEvent({ event: "DISABLED" }, "x")).toMatchObject({ status: "DISABLED", notify: true });
  });

  it("FLAGGED no cambia el estado pero sí avisa", () => {
    expect(interpretStatusEvent({ event: "FLAGGED" }, "x")).toMatchObject({ status: null, notify: true });
  });

  it("los demás estados conocidos pasan sin avisar y los desconocidos se ignoran", () => {
    expect(interpretStatusEvent({ event: "IN_APPEAL" }, "x")).toMatchObject({ status: "IN_APPEAL", notify: false });
    expect(interpretStatusEvent({ event: "PENDING_DELETION" }, "x")).toMatchObject({ status: "PENDING_DELETION", notify: false });
    expect(interpretStatusEvent({ event: "ALGO_NUEVO" }, "x")).toBeNull();
    expect(interpretStatusEvent({}, "x")).toBeNull();
  });

  it("recorta motivos larguísimos", () => {
    expect(interpretStatusEvent({ event: "REJECTED", reason: "NONE", other_info: { description: "a".repeat(900) } }, "x")!.reason!.length).toBe(300);
  });
});
