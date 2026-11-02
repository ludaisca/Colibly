import { describe, expect, it } from "vitest";
import { missingRequiredFields, requiredFieldsMessage } from "../required-fields-rules";

const defs = [
  { key: "motivo", label: "Motivo", required: true },
  { key: "monto", label: "Monto", required: true },
  { key: "nota", label: "Nota", required: false },
];

describe("missingRequiredFields", () => {
  it("lista los obligatorios vacíos, ignora los opcionales", () => {
    expect(missingRequiredFields(defs, { motivo: "Venta", nota: "" })).toEqual([{ key: "monto", label: "Monto" }]);
  });
  it("espacios cuentan como vacío; \"false\" es un valor", () => {
    expect(missingRequiredFields(defs, { motivo: "  ", monto: "false" })).toEqual([{ key: "motivo", label: "Motivo" }]);
  });
  it("sin valores guardados (null o JSON raro) faltan todos los obligatorios", () => {
    expect(missingRequiredFields(defs, null)).toHaveLength(2);
    expect(missingRequiredFields(defs, ["x"])).toHaveLength(2);
  });
  it("sin definiciones obligatorias no falta nada", () => {
    expect(missingRequiredFields([{ key: "a", label: "A", required: false }], {})).toEqual([]);
  });
  it("mensaje legible", () => {
    expect(requiredFieldsMessage([{ label: "Motivo" }, { label: "Monto" }])).toBe("Para resolver, completa: Motivo, Monto");
  });
});
