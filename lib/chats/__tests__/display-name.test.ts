import { describe, expect, it } from "vitest";
import { displayName, isWebchatVisitorId, visitorLabel } from "../display-name";

describe("displayName", () => {
  it("un id de visitante del chat web se muestra legible y estable", () => {
    expect(displayName("v_2mQMV22W5kQ_BMpMguZSuaPC", "v_2mQMV22W5kQ_BMpMguZSuaPC")).toBe("Visitante web · UAPC");
    expect(displayName(null, "v_2mQMV22W5kQ_BMpMguZSuaPC")).toBe("Visitante web · UAPC");
  });
  it("un nombre real nunca se toca", () => {
    expect(displayName("Ana López", "v_2mQMV22W5kQ_BMpMguZSuaPC")).toBe("Ana López");
    expect(displayName("Ana", "5215512345678")).toBe("Ana");
  });
  it("sin nombre: el teléfono / id del canal; sin nada: el respaldo", () => {
    expect(displayName(null, "5215512345678")).toBe("5215512345678");
    expect(displayName("  ", "123456789")).toBe("123456789");
    expect(displayName(null, null)).toBe("Desconocido");
  });
  it("no confunde nombres que empiezan con v_ cortos ni teléfonos", () => {
    expect(isWebchatVisitorId("v_ana")).toBe(false);
    expect(isWebchatVisitorId("5215512345678")).toBe(false);
    expect(visitorLabel("v_abc-def_ghij-KLmn")).toBe("Visitante web · KLMN");
  });
});
